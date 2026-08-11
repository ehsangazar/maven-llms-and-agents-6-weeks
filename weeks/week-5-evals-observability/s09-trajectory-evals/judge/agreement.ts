/**
 * S9 · Is your LLM judge any good?
 *
 * The judge is the grader you cannot check by reading the code, because its
 * rule set is a paragraph of English. So you check it the only way you can:
 * hand-label a slice, run the judge over the same slice, and compare.
 *
 * The number that traps people is raw agreement. A judge that agrees with your
 * humans 94% of the time sounds excellent, right up to the moment you notice
 * 93% of those cases passed anyway, so "always say pass" would have scored 93.
 * Agreement is only meaningful against the baseline it has to beat.
 *
 * Pure and deterministic: no model, no key.
 */

/** One case, labelled twice: once by a person you trust, once by the judge. */
export interface Labelled {
  id: string;
  human: boolean;
  judge: boolean;
}

export interface JudgeReport {
  n: number;
  /** Fraction of cases where the judge matched the human. */
  agreement: number;
  /** What "always guess the majority label" would have scored on this set. */
  baseline: number;
  /** agreement minus baseline. This is the number that means something. */
  lift: number;
  /** Judge said pass, human said fail. The error that ships bugs. */
  falsePass: number;
  /** Judge said fail, human said pass. The error that wastes your week. */
  falseFail: number;
  falsePassRate: number;
  trustworthy: boolean;
}

export interface JudgeThresholds {
  /** Smallest labelled slice worth drawing a conclusion from. */
  minCases?: number;
  /** How far past the always-guess baseline the judge must land. */
  minLift?: number;
  /** Ceiling on the expensive error. */
  maxFalsePassRate?: number;
}

const EMPTY: JudgeReport = {
  n: 0,
  agreement: 0,
  baseline: 0,
  lift: 0,
  falsePass: 0,
  falseFail: 0,
  falsePassRate: 0,
  trustworthy: false,
};

/**
 * Score a judge against human labels. Returns a verdict on whether the judge
 * has earned the right to grade unsupervised.
 */
export function scoreJudge(rows: Labelled[], thresholds: JudgeThresholds = {}): JudgeReport {
  const { minCases = 30, minLift = 0.1, maxFalsePassRate = 0.05 } = thresholds;

  const n = rows.length;
  if (n === 0) return EMPTY;

  const agreement = rows.filter((r) => r.human === r.judge).length / n;

  // The baseline: how well a judge that never reads anything would do, just by
  // always shouting the label that happens to be more common in your set.
  const humanPass = rows.filter((r) => r.human).length;
  const baseline = Math.max(humanPass, n - humanPass) / n;

  const falsePass = rows.filter((r) => r.judge && !r.human).length;
  const falseFail = rows.filter((r) => !r.judge && r.human).length;
  const lift = agreement - baseline;
  const falsePassRate = falsePass / n;

  return {
    n,
    agreement,
    baseline,
    lift,
    falsePass,
    falseFail,
    falsePassRate,
    trustworthy: n >= minCases && lift >= minLift && falsePassRate <= maxFalsePassRate,
  };
}
