import { describe, it, expect } from "vitest";
import {
  PRICES,
  ceilingForShare,
  costOfCall,
  dominantTerm,
  expectedCost,
  revenueShare,
  unboundedAmplifiers,
  worstCaseCost,
  type CallShape,
  type RequestPlan,
} from "./price.ts";

/** The support-assistant request from the lesson: 7,200 in, 350 out, large tier. */
const answer: CallShape = {
  name: "answer",
  inputTokens: 7_200,
  outputTokens: 350,
  price: PRICES.large,
};

const router: CallShape = {
  name: "router",
  inputTokens: 900,
  outputTokens: 20,
  price: PRICES.small,
};

describe("costOfCall", () => {
  it("prices input and output separately", () => {
    const cost = costOfCall(answer);
    expect(cost.input).toBeCloseTo(0.0216, 6); // 7,200 / 1M * $3
    expect(cost.output).toBeCloseTo(0.00525, 6); // 350 / 1M * $15
    expect(cost.total).toBeCloseTo(0.02685, 6);
  });

  it("bills the cached slice of the prompt at the cache rate", () => {
    const cost = costOfCall({ ...answer, cachedInputTokens: 1_800 });
    // 5,400 fresh at $3 + 1,800 cached at $0.30
    expect(cost.input).toBeCloseTo(0.0162 + 0.00054, 6);
    expect(cost.cacheSaving).toBeGreaterThan(0);
  });

  it("never bills more cached tokens than there are input tokens", () => {
    const cost = costOfCall({ ...answer, cachedInputTokens: 99_999 });
    expect(cost.input).toBeCloseTo(perMillion(7_200, PRICES.large.cachedInputPerM), 6);
  });

  it("has no cache saving when nothing was cached", () => {
    expect(costOfCall(answer).cacheSaving).toBe(0);
  });

  it("shows input dominating, which is what picks your first lever", () => {
    expect(dominantTerm(costOfCall(answer))).toBe("input");
  });
});

describe("a request is not a call", () => {
  const plan: RequestPlan = {
    always: [router, answer],
    amplifiers: [
      // escalation to a bigger answer, a validation re-ask, a transport retry
      { rate: 0.05, worstCaseCount: 1, call: { ...answer, name: "escalate" } },
      { rate: 0.08, worstCaseCount: 1, call: { ...answer, name: "re-ask" } },
      { rate: 0.03, worstCaseCount: 2, call: { ...answer, name: "retry" } },
    ],
  };

  it("expected cost adds the amplifiers at their rates", () => {
    const one = costOfCall(answer).total;
    const expected = costOfCall(router).total + one + (0.05 + 0.08 + 0.03) * one;
    expect(expectedCost(plan)).toBeCloseTo(expected, 8);
  });

  it("worst case is materially higher than typical", () => {
    expect(worstCaseCost(plan)).toBeGreaterThan(expectedCost(plan) * 2);
  });

  it("flags an amplifier with no bound, because that is a missing loop limit", () => {
    const runaway: RequestPlan = {
      always: [answer],
      amplifiers: [{ rate: 2, worstCaseCount: Infinity, call: { ...answer, name: "agent-step" } }],
    };
    expect(unboundedAmplifiers(runaway)).toEqual(["agent-step"]);
    expect(unboundedAmplifiers(plan)).toEqual([]);
  });
});

describe("the ceiling is a business number", () => {
  const unit = { pricePerSeat: 20, requestsPerSeat: 130 };

  it("turns a per-request cost into a share of revenue", () => {
    expect(revenueShare(0.03, unit)).toBeCloseTo(0.195, 4); // $3.90 of a $20 seat
  });

  it("works backwards from a target share to the ceiling", () => {
    expect(ceilingForShare(0.1, unit)).toBeCloseTo(0.01538, 5);
  });

  it("round-trips: the ceiling it gives you lands on the target share", () => {
    const ceiling = ceilingForShare(0.1, unit);
    expect(revenueShare(ceiling, unit)).toBeCloseTo(0.1, 8);
  });

  it("refuses nonsense inputs rather than returning a confident wrong number", () => {
    expect(() => revenueShare(0.03, { ...unit, pricePerSeat: 0 })).toThrow();
    expect(() => ceilingForShare(0.1, { ...unit, requestsPerSeat: 0 })).toThrow();
  });
});

const perMillion = (tokens: number, pricePerM: number) => (tokens / 1_000_000) * pricePerM;
