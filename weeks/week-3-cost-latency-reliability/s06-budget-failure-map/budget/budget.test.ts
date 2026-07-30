import { describe, it, expect } from "vitest";
import { guessCount, reviewBudget, type RequestBudget } from "./budget.ts";
import { BUDGET } from "../example/support-assistant.ts";

/** Deep-ish clone so each test can bend one field without leaking into the next. */
const bend = (fn: (b: RequestBudget) => void): RequestBudget => {
  const copy = structuredClone(BUDGET);
  fn(copy);
  return copy;
};

describe("the worked budget", () => {
  it("passes its own review, because a reference artifact that fails is not a reference", () => {
    const review = reviewBudget(BUDGET);
    expect(review.violations).toEqual([]);
    expect(review.ok).toBe(true);
  });

  it("leaves headroom for the ladder", () => {
    const review = reviewBudget(BUDGET);
    expect(review.workMs).toBe(1_570);
    expect(review.headroomMs).toBe(400);
  });

  it("has no unlabelled guesses left in it", () => {
    expect(guessCount(BUDGET)).toBe(0);
  });
});

describe("reviewBudget catches the things reviewers get tired of saying", () => {
  it("a ceiling with no reasoning behind it", () => {
    const review = reviewBudget(bend((b) => (b.cost.because = "feels right")));
    expect(review.violations.join(" ")).toContain("no reasoning");
  });

  it("an unbounded worst case", () => {
    const review = reviewBudget(bend((b) => (b.cost.worst.value = Infinity)));
    expect(review.violations.join(" ")).toContain("unbounded");
  });

  it("a worst case that is not worse than typical", () => {
    const review = reviewBudget(bend((b) => (b.cost.worst.value = 0.01)));
    expect(review.violations.join(" ")).toContain("not above typical");
  });

  it("no hard cap on calls, which is a missing loop limit rather than a missing number", () => {
    const review = reviewBudget(bend((b) => (b.calls.hardMax = Infinity)));
    expect(review.violations.join(" ")).toContain("missing loop limit");
  });

  it("a latency ceiling that never gets split across hops", () => {
    const review = reviewBudget(bend((b) => (b.latency.hops = [])));
    expect(review.violations.join(" ")).toContain("split it across the hops");
  });

  it("too little headroom to degrade", () => {
    const review = reviewBudget(bend((b) => (b.latency.headroomFraction = 0.05)));
    expect(review.violations.join(" ")).toContain("nowhere to run");
  });

  it("hops that overrun the ceiling once headroom is reserved", () => {
    const review = reviewBudget(bend((b) => b.latency.hops.push({ name: "second call", budgetMs: 600 })));
    expect(review.violations.join(" ")).toContain("exceed");
  });

  it("a hop with no deadline of its own", () => {
    const review = reviewBudget(bend((b) => b.latency.hops.push({ name: "rerank v2", budgetMs: 0 })));
    expect(review.violations.join(" ")).toContain("rerank v2");
  });

  it("a guess with no date to replace it", () => {
    const review = reviewBudget(bend((b) => (b.cost.typical.confidence = "guessed")));
    expect(review.violations.join(" ")).toContain("no date to replace");
  });

  it("accepts a guess that carries its expiry", () => {
    const review = reviewBudget(
      bend((b) => {
        b.cost.typical.confidence = "guessed";
        b.cost.typical.replaceBy = "2026-08-10, after one week of real traffic";
      }),
    );
    expect(review.violations).toEqual([]);
    expect(guessCount(bend((b) => (b.cost.typical.confidence = "guessed")))).toBe(1);
  });

  it("warns, rather than fails, when the request is named like an endpoint", () => {
    const review = reviewBudget(bend((b) => (b.request = "POST /api/chat handler")));
    expect(review.ok).toBe(true);
    expect(review.warnings.join(" ")).toContain("user action");
  });

  it("warns when no levers are ticked", () => {
    expect(reviewBudget(bend((b) => (b.leversOn = []))).warnings.join(" ")).toContain("no levers");
  });
});
