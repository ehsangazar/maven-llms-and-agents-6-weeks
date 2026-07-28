import { describe, it, expect } from "vitest";
import { prepareContext, freshnessScore, type Doc } from "./pipeline.ts";

const doc = (id: string, text: string, ageDays: number, relevance: number): Doc => ({
  id,
  text,
  ageDays,
  relevance,
});

describe("freshnessScore", () => {
  it("ranks a fresher doc above a stale one at equal relevance", () => {
    expect(freshnessScore(doc("new", "t", 1, 0.8))).toBeGreaterThan(
      freshnessScore(doc("old", "t", 200, 0.8)),
    );
  });
});

describe("prepareContext", () => {
  it("de-duplicates identical text, keeping the freshest copy", () => {
    const out = prepareContext(
      [doc("stale", "same policy text", 90, 0.9), doc("fresh", "same policy text", 2, 0.9)],
      10_000,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("fresh");
  });

  it("orders survivors by freshness-adjusted relevance", () => {
    const out = prepareContext(
      [doc("a", "aaa", 200, 0.9), doc("b", "bbb", 1, 0.7)],
      10_000,
    );
    // b is fresher enough to overtake a's higher raw relevance
    expect(out.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("respects the character budget", () => {
    const out = prepareContext(
      [doc("a", "x".repeat(60), 1, 0.9), doc("b", "y".repeat(60), 1, 0.8)],
      100,
    );
    expect(out).toHaveLength(1);
  });
});
