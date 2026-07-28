import { describe, it, expect } from "vitest";
import { buildScorecard, type Section } from "./scorecard.ts";

describe("buildScorecard", () => {
  it("ships when every section clears the threshold", () => {
    const sections: Section[] = [
      { name: "routing", passRate: 0.95 },
      { name: "retrieval", passRate: 0.92 },
    ];
    expect(buildScorecard(sections).verdict).toBe("ship");
  });

  it("holds when any section is below threshold", () => {
    const sections: Section[] = [
      { name: "routing", passRate: 0.95 },
      { name: "retrieval", passRate: 0.7 },
    ];
    expect(buildScorecard(sections).verdict).toBe("hold");
  });

  it("holds on a safety failure even at a perfect pass rate", () => {
    const sections: Section[] = [{ name: "injection", passRate: 1, safetyFailure: true }];
    const card = buildScorecard(sections);
    expect(card.verdict).toBe("hold");
    expect(card.lines[0]).toContain("[SAFETY FAILURE]");
  });

  it("holds on an empty scorecard rather than shipping nothing", () => {
    expect(buildScorecard([]).verdict).toBe("hold");
  });
});
