import { describe, it, expect } from "vitest";
import { moderate, COST, type ModerationDeps } from "./moderate.ts";

const deps = (over: Partial<ModerationDeps> = {}): ModerationDeps => ({
  cheap: async () => ({ verdict: "allow", confident: true }),
  strong: async () => ({ verdict: "block", confident: true }),
  ...over,
});

const GENEROUS = 1; // dollars, plenty for both rungs

describe("moderate", () => {
  it("stops at the cheap tier when it is confident", async () => {
    const out = await moderate("hi", deps(), GENEROUS);
    expect(out.tier).toBe("cheap");
    expect(out.spent).toBeCloseTo(COST.cheap);
  });

  it("escalates to the strong tier when the cheap one is unsure", async () => {
    const out = await moderate("borderline", deps({ cheap: async () => ({ verdict: "allow", confident: false }) }), GENEROUS);
    expect(out.tier).toBe("strong");
    expect(out.verdict).toBe("block");
    expect(out.spent).toBeCloseTo(COST.cheap + COST.strong);
  });

  it("fails closed when the budget cannot cover the escalation", async () => {
    // enough for cheap, not enough to add strong
    const budget = COST.cheap + COST.strong / 2;
    const out = await moderate("borderline", deps({ cheap: async () => ({ verdict: "allow", confident: false }) }), budget);
    expect(out.tier).toBe("safe-default");
    expect(out.verdict).toBe("block");
    expect(out.spent).toBeCloseTo(COST.cheap); // paid for the rung it did reach
  });

  it("fails closed without spending when even the cheap tier is unaffordable", async () => {
    const out = await moderate("x", deps(), COST.cheap / 2);
    expect(out.tier).toBe("safe-default");
    expect(out.spent).toBe(0);
  });
});
