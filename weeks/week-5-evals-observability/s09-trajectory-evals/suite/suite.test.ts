import { describe, it, expect } from "vitest";
import { diffRuns, gate, passRate, type CaseResult } from "./suite.ts";

/** 100 cases; `passing` is the set of ids that passed. */
function run(passing: (i: number) => boolean): CaseResult[] {
  return Array.from({ length: 100 }, (_, i) => ({ id: `case-${i}`, pass: passing(i) }));
}

describe("the regression gate", () => {
  // The headline everybody wants to ship on: 84% to 91%.
  const baseline = run((i) => i < 84);
  const candidate = run((i) => (i < 4 ? false : i < 95));

  it("reports the pass rate everybody quotes", () => {
    expect(passRate(baseline)).toBeCloseTo(0.84);
    expect(passRate(candidate)).toBeCloseTo(0.91);
  });

  it("finds the four regressions hiding under a seven-point improvement", () => {
    const diff = diffRuns(baseline, candidate);

    expect(diff.regressed).toEqual(["case-0", "case-1", "case-2", "case-3"]);
    expect(diff.fixed).toHaveLength(11);
  });

  it("blocks the ship even though the average went up", () => {
    const verdict = gate(diffRuns(baseline, candidate));

    expect(verdict.ship).toBe(false);
    expect(verdict.why).toContain("4 case(s) regressed");
  });

  it("ships a change that fixes cases and breaks none", () => {
    const clean = run((i) => i < 91);
    const verdict = gate(diffRuns(baseline, clean));

    expect(verdict.ship).toBe(true);
    expect(verdict.why).toContain("84% → 91%");
  });

  it("blocks a run whose eval set quietly changed underneath it", () => {
    const shrunk = baseline.slice(0, 99);
    const verdict = gate(diffRuns(baseline, shrunk));

    expect(verdict.ship).toBe(false);
    expect(verdict.why).toContain("eval set changed");
  });
});
