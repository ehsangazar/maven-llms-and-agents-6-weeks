/**
 * S5 real-world example, a per-request budget that can halt escalation.
 *
 * Content moderation on a ladder: a cheap classifier first, a stronger one only
 * if the cheap one is unsure. Every attempt costs money, and there is a hard
 * per-request budget. When the budget cannot cover the next rung, we stop and
 * fail closed (block), because for moderation the safe default is "block", not
 * "let it through".
 *
 * Pure and deps-injected: the classifiers arrive as `deps`, so the budget and
 * fail-closed logic is testable with no API key.
 */
export type Verdict = "allow" | "block";

export interface ModerationDeps {
  cheap(text: string): Promise<{ verdict: Verdict; confident: boolean }>;
  strong(text: string): Promise<{ verdict: Verdict; confident: boolean }>;
}

/** Illustrative per-call costs in USD. The ratio is the point, not the digits. */
export const COST = { cheap: 0.0002, strong: 0.004 } as const;

/** Moderation fails closed: if we cannot decide, we block. */
export const SAFE_DEFAULT: Verdict = "block";

export interface ModerationOutcome {
  verdict: Verdict;
  tier: "cheap" | "strong" | "safe-default";
  spent: number;
}

export async function moderate(
  text: string,
  deps: ModerationDeps,
  budget: number,
): Promise<ModerationOutcome> {
  let spent = 0;

  if (spent + COST.cheap <= budget) {
    spent += COST.cheap;
    const r = await deps.cheap(text);
    if (r.confident) return { verdict: r.verdict, tier: "cheap", spent };
  }

  if (spent + COST.strong <= budget) {
    spent += COST.strong;
    const r = await deps.strong(text);
    if (r.confident) return { verdict: r.verdict, tier: "strong", spent };
  }

  // Out of budget or still unsure: fail closed.
  return { verdict: SAFE_DEFAULT, tier: "safe-default", spent };
}
