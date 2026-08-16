import { describe, it, expect } from "vitest";
import { routeForReview, calibrateThreshold, correctionToCase, type RoutePolicy } from "./route.ts";
import type { Trace } from "../tracing/trace.ts";

const policy: RoutePolicy = {
  irreversibleTools: ["issue_refund", "send_email", "delete_account"],
  minConfidence: 0.7,
};

const traceWith = (tools: string[]): Trace => ({
  requestId: "req_a1",
  outcome: "ok",
  ms: 900,
  costUsd: 0.01,
  spans: tools.map((name) => ({ type: "tool" as const, name, ms: 40, costUsd: 0, attrs: { ok: true } })),
});

describe("routeForReview", () => {
  it("ships a confident, reversible answer without a human", () => {
    expect(routeForReview(traceWith(["lookup_policy"]), 0.93, policy).route).toBe("auto");
  });

  it("sends the low-confidence tail to review", () => {
    const d = routeForReview(traceWith(["lookup_policy"]), 0.41, policy);
    expect(d.route).toBe("review");
    expect(d.reason).toContain("low confidence");
  });

  it("reviews an irreversible action even when the model is sure", () => {
    // Confidence is not the same thing as authority.
    const d = routeForReview(traceWith(["lookup_policy", "issue_refund"]), 0.99, policy);
    expect(d.route).toBe("review");
    expect(d.reason).toContain("issue_refund");
  });
});

describe("calibrateThreshold", () => {
  it("sets the line from review capacity, not from a round number", () => {
    const sample = Array.from({ length: 100 }, (_, i) => i / 100); // 0.00 to 0.99
    expect(calibrateThreshold(sample, 0.05)).toBeCloseTo(0.05); // 5% capacity, 5% reviewed
    expect(calibrateThreshold(sample, 0.2)).toBeCloseTo(0.2);
  });

  it("returns 0 rather than flooding a queue with no capacity behind it", () => {
    expect(calibrateThreshold([0.1, 0.9], 0)).toBe(0);
    expect(calibrateThreshold([], 0.1)).toBe(0);
  });
});

describe("correctionToCase", () => {
  it("turns one reviewer's fix into a permanent test case", () => {
    const c = correctionToCase(traceWith(["issue_refund"]), "I was charged twice", "billing");
    expect(c).toEqual({
      name: "correction-req_a1",
      input: "I was charged twice",
      expect: "billing",
      source: "human-correction",
      traceId: "req_a1", // the trace is still there to replay
    });
  });
});
