import { describe, it, expect } from "vitest";
import { assembleContext, type Piece } from "./context.ts";

const p = (id: string, score: number, len: number): Piece => ({
  id,
  score,
  text: "x".repeat(len),
});

describe("assembleContext", () => {
  it("includes the highest-scoring pieces first", () => {
    const { included } = assembleContext([p("a", 0.2, 10), p("b", 0.9, 10)], 1000);
    expect(included.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("never exceeds the budget", () => {
    const { usedChars } = assembleContext([p("a", 0.9, 60), p("b", 0.8, 60)], 100);
    expect(usedChars).toBeLessThanOrEqual(100);
  });

  it("drops what does not fit, but keeps packing smaller pieces", () => {
    // top piece is huge and gets dropped; a smaller lower-ranked one still fits
    const { included, dropped } = assembleContext(
      [p("big", 0.99, 200), p("small", 0.5, 40)],
      100,
    );
    expect(dropped.map((d) => d.id)).toContain("big");
    expect(included.map((i) => i.id)).toContain("small");
  });

  it("includes everything when the budget is generous", () => {
    const { dropped } = assembleContext([p("a", 0.5, 10), p("b", 0.4, 10)], 10_000);
    expect(dropped).toEqual([]);
  });
});
