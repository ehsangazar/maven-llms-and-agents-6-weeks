/**
 * LAB 1 — Workflow router (SOLUTION).
 *
 * The worked reference for `starter/router.ts`. Every test in
 * `../router.test.ts` passes against this file.
 *
 * The shape (S1's routing pattern, hardened):
 *
 *     request -> classify -> choose a tier -> handle -> validate -> reply
 *                                    |            |
 *                                    |            +-- on failure: escalate
 *                                    +-- rules / small model / large model
 *
 * Everything the model touches is injected via `RouterDeps`. That is not
 * ceremony: it is what lets the tests run with no API key and no network, and
 * it is the same seam that makes the router swappable in production.
 */
import { z } from "zod";

/** What the classifier must return. Never trust free text here. */
export const Classification = z.object({
  category: z.enum(["greeting", "billing", "technical", "legal"]),
  complexity: z.enum(["trivial", "normal", "hard"]),
  reason: z.string(),
});
export type Classification = z.infer<typeof Classification>;

/** What a handler must return before it is allowed to leave the system. */
export const Reply = z.object({
  answer: z.string().min(1),
  confident: z.boolean(),
});
export type Reply = z.infer<typeof Reply>;

export type Tier = "rules" | "small" | "large";

/**
 * Illustrative per-request costs, in USD. These are S5's numbers: a 3k-in /
 * 500-out request on a small model versus a frontier model. Prices move; the
 * ~25x ratio is the point.
 */
export const TIER_COST: Record<Tier, number> = {
  rules: 0,
  small: 0.0007,
  large: 0.017,
};

/** The escalation order. `rules` is only ever chosen up front, never escalated to. */
const LADDER: Tier[] = ["rules", "small", "large"];

/** Returned when every rung of the ladder has failed. Degrade, do not break. */
export const SAFE_DEFAULT: Reply = {
  answer: "I can't answer that reliably right now. Let me hand you to a human.",
  confident: false,
};

export interface RouterDeps {
  /** Classify the request. In production this is a small model call. */
  classify(request: string): Promise<Classification>;
  /** Call a model tier. Returns UNVALIDATED output on purpose: you validate it. */
  callModel(tier: "small" | "large", request: string): Promise<unknown>;
  /** Deterministic handler. Returns null when it cannot answer. */
  rules(request: string): Reply | null;
}

export interface Attempt {
  tier: Tier;
  ok: boolean;
}

export class Ledger {
  readonly attempts: Attempt[] = [];

  record(tier: Tier, ok: boolean): void {
    this.attempts.push({ tier, ok });
  }

  /**
   * Cost report: what each tier absorbed, and what it cost.
   *
   * Note it reports EVERY attempt, including the failed ones. A fallback that
   * escalates has already paid for the rung it fell off. That is exactly the
   * cost people forget to budget for.
   */
  report(): { totalCost: number; byTier: Record<Tier, { attempts: number; share: number; cost: number }> } {
    const total = this.attempts.length;

    const byTier = {} as Record<Tier, { attempts: number; share: number; cost: number }>;
    let totalCost = 0;

    for (const tier of LADDER) {
      const attempts = this.attempts.filter((a) => a.tier === tier).length;
      const cost = attempts * TIER_COST[tier];

      byTier[tier] = {
        attempts,
        // An empty ledger is a real state (nothing has run yet), not an error.
        // Guarding here is why `report()` on a fresh Ledger returns 0 instead of NaN.
        share: total === 0 ? 0 : attempts / total,
        cost,
      };

      totalCost += cost;
    }

    return { totalCost, byTier };
  }
}

/**
 * Pick the cheapest tier that can plausibly do the job.
 *
 * The whole point of the lab: most traffic is easy, and the expensive model
 * should not be answering easy questions. But cheapness is not the only axis,
 * some categories are risky enough to be worth the big model regardless.
 */
export function chooseTier(c: Classification): Tier {
  // Risk first, and it outranks everything below. A trivial-looking legal
  // question is still the one you do not want the cheap model improvising on,
  // so this check has to come before the complexity ladder, not after it.
  if (c.category === "legal") return "large";

  if (c.complexity === "trivial") return "rules";
  if (c.complexity === "hard") return "large";

  return "small";
}

/**
 * Validate a handler's raw output into a Reply, or throw.
 *
 * The model proposes; this line is where code disposes. Nothing reaches a user
 * without passing through here.
 */
export function validateReply(raw: unknown): Reply {
  // `parse` throws on bad input, which is what we want: runRouter catches it and
  // treats it as this rung failing. Using `safeParse` here would mean inventing
  // a second failure channel for no benefit.
  return Reply.parse(raw);
}

/**
 * Route one request, escalating on failure, recording every attempt.
 *
 * Failure means either the tier threw (the model was down, the output was
 * unparseable) OR it came back `confident: false`. Both mean "this rung did not
 * do the job", so both escalate.
 */
export async function runRouter(request: string, deps: RouterDeps, ledger: Ledger): Promise<Reply> {
  const classification = await deps.classify(request);
  const start = chooseTier(classification);

  // Start where the classifier put us and walk down. Nothing ever escalates
  // back up to `rules`: a deterministic handler that already declined is not
  // going to change its mind.
  for (const tier of LADDER.slice(LADDER.indexOf(start))) {
    try {
      const reply =
        tier === "rules"
          ? deps.rules(request)
          : validateReply(await deps.callModel(tier, request));

      // Three distinct ways a rung fails, collapsed into one branch:
      //   - rules declined (null)
      //   - the tier answered, but hedged (confident: false)
      //   - it threw, which lands in the catch below
      // The middle one is the one people miss. Nothing threw, so the bad answer
      // ships unless you treat a hedge as a failure.
      if (reply === null || !reply.confident) {
        ledger.record(tier, false);
        continue;
      }

      ledger.record(tier, true);
      return reply;
    } catch {
      // A failed rung still costs money, so it still gets recorded. The invoice
      // does not care that the call was useless.
      ledger.record(tier, false);
    }
  }

  // Every rung failed. Degrade honestly rather than throwing at the caller.
  return SAFE_DEFAULT;
}
