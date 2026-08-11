import { describe, it, expect } from "vitest";
import { checkOrder, gradeTrajectory } from "./trajectory.ts";

const EXPECTED = ["check_policy", "issue_refund"];

describe("checkOrder", () => {
  it("passes when the required steps happen in order", () => {
    const result = checkOrder(["greet", "check_policy", "issue_refund", "reply"], EXPECTED);
    expect(result.pass).toBe(true);
  });

  it("fails when a required step is missing", () => {
    const result = checkOrder(["greet", "issue_refund"], EXPECTED);
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual(["check_policy"]);
  });

  it("fails when the steps happen in the wrong order: refund before policy", () => {
    const result = checkOrder(["issue_refund", "check_policy"], EXPECTED);
    expect(result.pass).toBe(false);
    expect(result.outOfOrder).toBe(true);
  });
});

describe("gradeTrajectory", () => {
  const SPEC = { required: EXPECTED, forbidden: ["email_customer_card"], maxSteps: 6 };

  it("ignores extra steps it was never asked about", () => {
    // The whole point of asserting only required steps: adding a log call
    // must not turn the suite red.
    const trace = ["greet", "log", "check_policy", "log", "issue_refund", "reply"];
    expect(gradeTrajectory(trace, SPEC).pass).toBe(true);
  });

  it("fails a forbidden step even when the required path is perfect", () => {
    const trace = ["check_policy", "issue_refund", "email_customer_card"];
    const grade = gradeTrajectory(trace, SPEC);
    expect(grade.pass).toBe(false);
    expect(grade.forbidden).toEqual(["email_customer_card"]);
  });

  it("fails a correct answer that took too many steps", () => {
    const trace = ["greet", "search", "search", "search", "check_policy", "issue_refund", "reply"];
    const grade = gradeTrajectory(trace, SPEC);
    expect(grade.pass).toBe(false);
    expect(grade.overBudget).toBe(true);
    expect(grade.missing).toEqual([]);
  });
});
