import { describe, it, expect } from "vitest";
import {
  Deadline,
  chainSuccessProbability,
  reviewPlan,
  withDeadline,
  type DeadlinePlan,
} from "./deadline.ts";

/** The split from the lesson: 2s ceiling, 1,570ms of work, the rest held back. */
const plan: DeadlinePlan = {
  ceilingMs: 2_000,
  headroomFraction: 0.2,
  hops: [
    { name: "embed", budgetMs: 60 },
    { name: "search", budgetMs: 180 },
    { name: "rerank", budgetMs: 150 },
    { name: "assemble", budgetMs: 35 },
    { name: "model", budgetMs: 1_100 },
    { name: "validate", budgetMs: 45 },
  ],
};

describe("reviewPlan", () => {
  it("accepts a split that leaves headroom", () => {
    const report = reviewPlan(plan);
    expect(report.workMs).toBe(1_570);
    expect(report.headroomMs).toBe(400);
    expect(report.spareMs).toBe(30);
    expect(report.violations).toEqual([]);
  });

  it("rejects a split that spends the whole ceiling on the happy path", () => {
    const greedy = { ...plan, hops: [...plan.hops, { name: "second model call", budgetMs: 400 }] };
    expect(reviewPlan(greedy).violations.join(" ")).toContain("exceeds");
  });

  it("rejects too little headroom, because the ladder needs somewhere to run", () => {
    expect(reviewPlan({ ...plan, headroomFraction: 0.05 }).violations.join(" ")).toContain("headroom");
  });

  it("names a hop that has no deadline of its own", () => {
    const sloppy = { ...plan, hops: [...plan.hops.slice(1), { name: "rerank", budgetMs: 0 }] };
    expect(reviewPlan(sloppy).violations.join(" ")).toContain("rerank");
  });
});

describe("percentiles do not add", () => {
  it("five hops at p95 miss the budget far more often than 5 percent", () => {
    expect(chainSuccessProbability(0.95, 5)).toBeCloseTo(0.7738, 4);
  });

  it("each extra hop costs you more tail", () => {
    expect(chainSuccessProbability(0.95, 6)).toBeLessThan(chainSuccessProbability(0.95, 5));
  });

  it("refuses a probability that is not a probability", () => {
    expect(() => chainSuccessProbability(1.2, 3)).toThrow();
  });
});

describe("Deadline", () => {
  /** A clock you advance by hand, so no test waits on real time. */
  const clock = (start = 0) => {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };

  it("counts down as the request proceeds", () => {
    const c = clock();
    const d = new Deadline(2_000, c.now);
    expect(d.remainingMs()).toBe(2_000);
    c.advance(600);
    expect(d.elapsedMs()).toBe(600);
    expect(d.remainingMs()).toBe(1_400);
    expect(d.expired()).toBe(false);
  });

  it("shrinks a later hop when an earlier one overran, instead of the ceiling", () => {
    const c = clock();
    const d = new Deadline(2_000, c.now);
    c.advance(1_500); // retrieval took far longer than its 425ms slice
    expect(d.allow(1_100)).toBe(500);
  });

  it("clamps at zero and reports expiry rather than going negative", () => {
    const c = clock();
    const d = new Deadline(500, c.now);
    c.advance(900);
    expect(d.remainingMs()).toBe(0);
    expect(d.expired()).toBe(true);
    expect(d.allow(200)).toBe(0);
  });

  it("tells you not to start a retry there is no time to finish", () => {
    const c = clock();
    const d = new Deadline(2_000, c.now);
    c.advance(1_800);
    expect(d.affords(400)).toBe(false);
    expect(d.affords(150)).toBe(true);
  });
});

describe("withDeadline", () => {
  it("returns the value when the work finishes in time", async () => {
    await expect(withDeadline(50, async () => "ok")).resolves.toBe("ok");
  });

  it("aborts the signal so the work itself can stop, not just the caller", async () => {
    const aborted = await withDeadline(5, (signal) =>
      new Promise<boolean>((resolve) => {
        signal.addEventListener("abort", () => resolve(true));
      }),
    );
    expect(aborted).toBe(true);
  });

  it("clears its timer even when the work throws", async () => {
    await expect(withDeadline(50, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
