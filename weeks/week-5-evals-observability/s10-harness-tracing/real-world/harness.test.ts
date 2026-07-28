import { describe, it, expect } from "vitest";
import { runSuite, type Case } from "./harness.ts";

const cases: Case<string, string>[] = [
  { name: "billing", input: "refund me", expect: "billing" },
  { name: "tech", input: "it crashed", expect: "technical" },
];

const grade = (got: string, expected: string) => got === expected;

describe("runSuite", () => {
  it("reports 1.0 when every case passes, and keeps each trace", async () => {
    const system = async (input: string) => ({
      out: input === "refund me" ? "billing" : "technical",
      trace: ["classify"],
    });
    const report = await runSuite(cases, system, grade);
    expect(report.passRate).toBe(1);
    expect(report.results[0]!.trace).toEqual(["classify"]);
  });

  it("computes a partial pass rate when a case fails", async () => {
    const system = async () => ({ out: "billing", trace: ["classify"] }); // wrong for the tech case
    const report = await runSuite(cases, system, grade);
    expect(report.passed).toBe(1);
    expect(report.passRate).toBeCloseTo(0.5);
  });

  it("returns 0 for an empty suite without dividing by zero", async () => {
    const report = await runSuite([], async () => ({ out: "x", trace: [] }), grade);
    expect(report.passRate).toBe(0);
    expect(report.total).toBe(0);
  });
});
