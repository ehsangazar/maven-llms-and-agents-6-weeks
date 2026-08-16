import { describe, it, expect } from "vitest";
import { percentile, summarise, evaluateAlerts, type AlertRule } from "./percentiles.ts";
import type { Trace } from "../tracing/trace.ts";

const trace = (ms: number, costUsd = 0.01): Trace => ({
  requestId: `req_${ms}`,
  outcome: "ok",
  ms,
  costUsd,
  spans: [{ type: "model", name: "answer", ms, costUsd, attrs: { promptVersion: "v1" } }],
});

/** 88 fast requests and 12 slow ones. The classic production shape. */
const skewed = [
  ...Array.from({ length: 88 }, () => trace(400)),
  ...Array.from({ length: 12 }, () => trace(9_000)),
];

describe("percentile", () => {
  it("returns 0 for an empty window rather than NaN", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("does not care about input order", () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([3, 2, 4, 1, 5], 50)).toBe(3);
  });

  it("picks a real sample, never an interpolated one", () => {
    expect([1, 2, 3, 4]).toContain(percentile([1, 2, 3, 4], 75));
  });
});

describe("the mean hides the tail", () => {
  it("reports a comfortable average while 12% of users wait nine seconds", () => {
    const w = summarise(skewed, { passed: 9, scored: 10 });
    expect(Math.round(w.latencyMean)).toBe(1432); // "about a second and a half, fine"
    expect(w.latencyP50).toBe(400); // the median agrees, and both are lying
    expect(w.latencyP95).toBe(9_000); // twelve users in a hundred have left
  });
});

describe("percentiles do not average", () => {
  it("the mean of two shard p95s is not the p95 of the traffic", () => {
    const quiet = Array.from({ length: 100 }, () => 100);
    const busy = [...Array.from({ length: 90 }, () => 200), ...Array.from({ length: 10 }, () => 9_000)];

    const shardAverage = (percentile(quiet, 95) + percentile(busy, 95)) / 2;
    const truth = percentile([...quiet, ...busy], 95);

    expect(shardAverage).toBe(4550);
    expect(truth).toBe(200);
    // Off by 22x, and it fires a page for a breach that never happened.
    expect(shardAverage).toBeGreaterThan(truth * 20);
  });
});

const rules: AlertRule[] = [
  {
    metric: "costPerRequestUsd",
    direction: "above",
    threshold: 0.02,
    action: "watch",
    because: "the Week 3 budget priced this request at 2 cents",
  },
  {
    metric: "latencyP95",
    direction: "above",
    threshold: 3_000,
    action: "page",
    because: "the deadline split in Project 2 gave the model 3 seconds",
  },
  {
    metric: "passRate",
    direction: "below",
    threshold: 0.9,
    action: "page",
    because: "below 0.9 the online set has caught a real regression twice",
  },
];

describe("evaluateAlerts", () => {
  it("fires on the tail, not on the mean", () => {
    const firing = evaluateAlerts(summarise(skewed, { passed: 10, scored: 10 }), rules);
    expect(firing.map((f) => f.metric)).toEqual(["latencyP95"]);
    expect(firing[0]!.action).toBe("page");
  });

  it("stays quiet when every line holds", () => {
    const healthy = Array.from({ length: 100 }, () => trace(400));
    expect(evaluateAlerts(summarise(healthy, { passed: 10, scored: 10 }), rules)).toEqual([]);
  });

  it("refuses to fire on a thin window, which is how alerts get muted", () => {
    const thin = [trace(400), trace(30_000)]; // p95 = 30s, on two requests, meaning nothing
    expect(evaluateAlerts(summarise(thin, { passed: 0, scored: 1 }), rules)).toEqual([]);
  });

  it("carries the reason, so the person paged at 3am knows what the line is for", () => {
    const bad = Array.from({ length: 100 }, () => trace(400, 0.05));
    const firing = evaluateAlerts(summarise(bad, { passed: 10, scored: 10 }), rules);
    expect(firing[0]!.because).toContain("Week 3 budget");
  });
});
