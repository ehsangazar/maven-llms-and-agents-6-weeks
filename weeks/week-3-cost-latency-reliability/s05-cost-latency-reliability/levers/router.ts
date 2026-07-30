/**
 * S5 · levers 4 and 5, routing and right-sizing.
 *
 * Small model by default, escalate on need. Two rules that keep this honest:
 *
 *   - Rules first, the model is the fallback. A regex that answers "what are
 *     your opening hours" costs nothing and never hallucinates.
 *   - The escalation is a decision you can see. Record which tier served the
 *     request, because degrading and working look identical without it.
 *
 * Right-sizing is the other half: the cheapest token is the one you never ask
 * for, so an output cap belongs in the route, not in a comment.
 */

export type Tier = "rules" | "small" | "large";

export interface Answer {
  text: string;
  /** The model's own read on whether it got there. Used to escalate, never to reassure. */
  confident: boolean;
}

export interface RouterDeps {
  /** Deterministic handlers that need no model at all. */
  rules: (question: string) => string | undefined;
  small: (question: string, maxOutputTokens: number) => Promise<Answer>;
  large: (question: string, maxOutputTokens: number) => Promise<Answer>;
}

export interface RouteOptions {
  /** Right-sizing: the cap the cheap tier gets. */
  smallMaxOutputTokens?: number;
  /** The escalated tier is allowed more room, not unlimited room. */
  largeMaxOutputTokens?: number;
  /** Questions this long skip the small tier: it will only escalate anyway. */
  escalateOverChars?: number;
}

export interface Served {
  text: string;
  /** The served-by rung. Put this on a dashboard or you will not notice degradation. */
  servedBy: Tier;
  /** Tiers that were tried and handed the request on. */
  escalatedFrom: Tier[];
}

export async function route(
  question: string,
  deps: RouterDeps,
  opts: RouteOptions = {},
): Promise<Served> {
  const smallCap = opts.smallMaxOutputTokens ?? 400;
  const largeCap = opts.largeMaxOutputTokens ?? 1_000;
  const escalatedFrom: Tier[] = [];

  const byRule = deps.rules(question);
  if (byRule !== undefined) {
    return { text: byRule, servedBy: "rules", escalatedFrom };
  }
  escalatedFrom.push("rules");

  const longQuestion = opts.escalateOverChars !== undefined && question.length > opts.escalateOverChars;
  if (!longQuestion) {
    const small = await deps.small(question, smallCap);
    if (small.confident) {
      return { text: small.text, servedBy: "small", escalatedFrom };
    }
    escalatedFrom.push("small");
  } else {
    escalatedFrom.push("small");
  }

  const large = await deps.large(question, largeCap);
  return { text: large.text, servedBy: "large", escalatedFrom };
}

/**
 * The router's classifier, grading itself. Escalation rate is a metric you
 * watch rather than page on: it drifting upward means the cheap tier stopped
 * being good enough, and your bill is about to say so.
 */
export function escalationRate(served: Served[]): number {
  if (served.length === 0) return 0;
  return served.filter((s) => s.servedBy === "large").length / served.length;
}

/** Traffic by rung. If the top rung is not carrying the traffic, you are degraded, not fine. */
export function servedByMix(served: Served[]): Record<Tier, number> {
  const mix: Record<Tier, number> = { rules: 0, small: 0, large: 0 };
  for (const s of served) mix[s.servedBy]++;
  return mix;
}
