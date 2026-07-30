import { describe, it, expect } from "vitest";
import { reviewBudget } from "../budget/budget.ts";
import { rank, reviewMap, silentShare } from "../failure-map/map.ts";
import { lintEntry } from "../runbook/runbook.ts";
import { INVESTIGATOR_BUDGET, INVESTIGATOR_MAP, UNGROUNDED_ENTRY } from "./bug-investigator.ts";

describe("the bug investigator's own Project 2", () => {
  it("has a budget that passes the review", () => {
    const review = reviewBudget(INVESTIGATOR_BUDGET);
    expect(review.violations).toEqual([]);
  });

  it("leaves headroom inside a deadline on-call will actually wait out", () => {
    const review = reviewBudget(INVESTIGATOR_BUDGET);
    expect(review.workMs).toBe(7_000);
    expect(review.headroomMs).toBe(2_000);
  });

  it("has a map that passes the rubric", () => {
    const review = reviewMap(INVESTIGATOR_MAP);
    expect(review.violations).toEqual([]);
  });

  it("is mostly silent failures, because that is the shape of this tool", () => {
    expect(silentShare(INVESTIGATOR_MAP)).toBeGreaterThan(0.5);
  });

  it("ranks fabrication above the log backend being down", () => {
    const ordered = rank(INVESTIGATOR_MAP).map((r) => r.failure);
    const fabrication = ordered.findIndex((f) => f.includes("appears nowhere"));
    const backendDown = ordered.findIndex((f) => f.includes("log backend is degraded"));
    expect(fabrication).toBeLessThan(backendDown);
  });

  it("keeps the destructive action behind a human, not behind a mitigation", () => {
    const row = INVESTIGATOR_MAP.find((r) => r.failure.includes("destructive"));
    expect(row?.blast).toBe(5);
    expect(row?.mitigation.class).toBe("prevent");
    expect(row?.mitigation.how).toContain("never holds a rollback credential");
  });

  it("has a runbook entry with no smells", () => {
    expect(lintEntry(UNGROUNDED_ENTRY)).toEqual([]);
  });

  it("names a flag rather than a person, and a number that closes the incident", () => {
    expect(UNGROUNDED_ENTRY.act.mitigation).toContain("investigator.handover_requires_grounding");
    expect(UNGROUNDED_ENTRY.act.confirmedBy).toContain("under 5 percent");
  });
});
