import { describe, it, expect } from "vitest";
import { checkOrder } from "./trajectory.ts";

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
