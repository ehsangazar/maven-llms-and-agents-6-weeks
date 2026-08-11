/**
 * S9 · The regression gate.
 *
 * Everyone builds the pass rate. The pass rate is the number that lies to you.
 * "84% to 91%" is a great headline and it can hide four cases that used to work
 * and now do not, which is exactly the shape of the bug that reaches a customer.
 *
 * So the gate is not "did the average go up". It is "did anything that used to
 * pass start failing".
 *
 * Pure and deterministic: no model, no key.
 */
export interface CaseResult {
  id: string;
  pass: boolean;
}

export interface RunDiff {
  baselineRate: number;
  candidateRate: number;
  /** Failed before, passes now. What you were trying to do. */
  fixed: string[];
  /** Passed before, fails now. What you did by accident. */
  regressed: string[];
  /** In one run but not the other. A silently shrinking eval set is a bug. */
  unmatched: string[];
}

export function passRate(results: CaseResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.pass).length / results.length;
}

export function diffRuns(baseline: CaseResult[], candidate: CaseResult[]): RunDiff {
  const before = new Map(baseline.map((r) => [r.id, r.pass]));
  const after = new Map(candidate.map((r) => [r.id, r.pass]));

  const fixed: string[] = [];
  const regressed: string[] = [];
  for (const [id, passedAfter] of after) {
    const passedBefore = before.get(id);
    if (passedBefore === undefined) continue;
    if (!passedBefore && passedAfter) fixed.push(id);
    if (passedBefore && !passedAfter) regressed.push(id);
  }

  const unmatched = [
    ...baseline.filter((r) => !after.has(r.id)).map((r) => r.id),
    ...candidate.filter((r) => !before.has(r.id)).map((r) => r.id),
  ];

  return {
    baselineRate: passRate(baseline),
    candidateRate: passRate(candidate),
    fixed,
    regressed,
    unmatched,
  };
}

export interface Gate {
  ship: boolean;
  why: string;
}

/**
 * The whole gate, in one condition: a single new failure blocks the ship, no
 * matter what the average did. Waivers are a conversation, not a threshold.
 */
export function gate(diff: RunDiff): Gate {
  if (diff.regressed.length > 0) {
    return {
      ship: false,
      why: `${diff.regressed.length} case(s) regressed: ${diff.regressed.join(", ")}`,
    };
  }
  if (diff.unmatched.length > 0) {
    return {
      ship: false,
      why: `eval set changed in the same commit as the fix: ${diff.unmatched.join(", ")}`,
    };
  }
  return {
    ship: true,
    why: `no regressions, ${diff.fixed.length} fixed, pass rate ${pct(diff.baselineRate)} → ${pct(diff.candidateRate)}`,
  };
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
