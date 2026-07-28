/**
 * S12 real-world example, turning eval numbers into a ship / hold decision.
 *
 * The design-review artifact: fold each section's pass rate into a single
 * scorecard with a verdict. One rule is not negotiable, a safety failure forces
 * "hold" no matter how green everything else is. That is the wrap-up lesson: a
 * 99% pass rate with an open injection hole is not a ship.
 *
 * Pure and deterministic: no model, no key.
 */
export interface Section {
  name: string;
  passRate: number;
  safetyFailure?: boolean;
}

export interface Scorecard {
  verdict: "ship" | "hold";
  lines: string[];
}

export function buildScorecard(sections: Section[], threshold = 0.9): Scorecard {
  const ok = (s: Section) => s.passRate >= threshold && !s.safetyFailure;

  const lines = sections.map(
    (s) =>
      `${ok(s) ? "PASS" : "HOLD"}  ${s.name} (${(s.passRate * 100).toFixed(0)}%)` +
      (s.safetyFailure ? "  [SAFETY FAILURE]" : ""),
  );

  const verdict: Scorecard["verdict"] = sections.length && sections.every(ok) ? "ship" : "hold";
  return { verdict, lines };
}
