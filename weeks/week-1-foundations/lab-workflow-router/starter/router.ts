/**
 * LAB 1 — Workflow router (STARTER).
 *
 * Fill in the TODOs. `weeks/week-1-foundations/lab-workflow-router/router.test.ts` is the spec:
 * run `npm test` and make it green.
 *
 * The shape to keep in your head (S1's routing pattern, hardened):
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
    // TODO: build the report.
    //  - `attempts` per tier: how many times that tier was called at all
    //  - `share`: that tier's attempts / total attempts (0 when there are none)
    //  - `cost`: attempts * TIER_COST[tier]
    //  - `totalCost`: the sum across tiers
    throw new Error("TODO: implement Ledger.report");
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
  // TODO: implement, per the spec in router.test.ts:
  //  - anything `legal` goes to `large`, whatever its complexity (risk, not difficulty)
  //  - otherwise `trivial` goes to `rules`
  //  - otherwise `hard` goes to `large`
  //  - everything else goes to `small`
  throw new Error("TODO: implement chooseTier");
}

/**
 * Validate a handler's raw output into a Reply, or throw.
 *
 * The model proposes; this line is where code disposes. Nothing reaches a user
 * without passing through here.
 */
export function validateReply(raw: unknown): Reply {
  // TODO: parse `raw` with the Reply schema and return it. Let it throw on bad input.
  throw new Error("TODO: implement validateReply");
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

  // TODO: walk the ladder from `start` to the end.
  //  For each tier:
  //    - `rules`: call deps.rules(request). A null result is a failure (record
  //      it and move on to the next rung); a Reply is a success.
  //    - `small` / `large`: await deps.callModel(tier, request), then
  //      validateReply(...) it. Anything that throws is a failure.
  //    - A Reply with confident: false is ALSO a failure. Escalate.
  //    - Record every attempt on the ledger, ok or not.
  //    - Return the first successful Reply.
  //  If every rung fails, record nothing further and return SAFE_DEFAULT.
  //
  // Hint: LADDER.slice(LADDER.indexOf(start)) gives you the rungs to try.
  throw new Error("TODO: implement runRouter");
}
