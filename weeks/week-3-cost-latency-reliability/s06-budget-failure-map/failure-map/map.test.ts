import { describe, it, expect } from "vitest";
import { rank, reviewMap, score, silentShare, type FailureRow } from "./map.ts";
import { TAXONOMY, uncoveredLayers, guideFor } from "./taxonomy.ts";
import { FAILURE_MAP } from "../example/support-assistant.ts";

const row = (over: Partial<FailureRow> = {}): FailureRow => ({
  layer: "model",
  failure: "a failure",
  likelihood: 2,
  blast: 2,
  blindness: 2,
  silent: false,
  mitigation: { class: "detect", how: "a specific dashboard and threshold" },
  ...over,
});

describe("scoring", () => {
  it("multiplies the three numbers", () => {
    expect(score(row({ likelihood: 2, blast: 5, blindness: 5 }))).toBe(50);
  });

  it("ranks the invisible catastrophe above the visible nuisance", () => {
    const leak = row({ failure: "cross-tenant cache hit", likelihood: 2, blast: 5, blindness: 5 });
    const timeout = row({ failure: "model timeout", likelihood: 4, blast: 2, blindness: 1 });
    expect(rank([timeout, leak])[0]?.failure).toBe("cross-tenant cache hit");
  });

  it("breaks ties on blast radius", () => {
    const a = row({ failure: "wide", likelihood: 2, blast: 4, blindness: 3 }); // 24
    const b = row({ failure: "narrow", likelihood: 4, blast: 2, blindness: 3 }); // 24
    expect(rank([b, a])[0]?.failure).toBe("wide");
  });

  it("reports the silent share, and does not divide by an empty map", () => {
    expect(silentShare([row({ silent: true }), row({ silent: false })])).toBe(0.5);
    expect(silentShare([])).toBe(0);
  });
});

describe("the worked map", () => {
  it("passes its own review", () => {
    const review = reviewMap(FAILURE_MAP);
    expect(review.violations).toEqual([]);
    expect(review.ok).toBe(true);
  });

  it("is more than half silent failures", () => {
    expect(silentShare(FAILURE_MAP)).toBeGreaterThan(0.5);
  });

  it("puts the tenant leak at the top, not the timeout everyone codes for", () => {
    expect(reviewMap(FAILURE_MAP).top[0]?.failure).toBe("cross-tenant cache hit");
    expect(reviewMap(FAILURE_MAP).top.map((r) => r.failure)).not.toContain("provider latency spike");
  });

  it("covers every layer of the taxonomy except the ones this system does not have", () => {
    const missing = uncoveredLayers(FAILURE_MAP.map((r) => r.layer));
    expect(missing).toEqual([]);
  });
});

describe("reviewMap enforces the rubric", () => {
  it("a blast-5 row mitigated by anything softer than prevent", () => {
    const review = reviewMap([row({ failure: "double charge", blast: 5, mitigation: { class: "detect", how: "a duplicate-receipt alert" } })]);
    expect(review.violations.join(" ")).toContain("needs prevent");
  });

  it("a mitigation that is only a class, with no specifics", () => {
    const review = reviewMap([row({ mitigation: { class: "degrade", how: "todo" } })]);
    expect(review.violations.join(" ")).toContain("no specific mitigation");
  });

  it("a high-scoring row with nothing on a dashboard behind it", () => {
    const review = reviewMap([row({ failure: "silent drift", likelihood: 3, blast: 3, blindness: 5, silent: true })]);
    expect(review.violations.join(" ")).toContain("no signal");
  });

  it("does not demand a signal for the rows you have chosen to accept", () => {
    const review = reviewMap([row({ failure: "stray markdown", likelihood: 3, blast: 1, blindness: 1, mitigation: { class: "accept", how: "documented as accepted, cosmetic only" } })]);
    expect(review.violations).toEqual([]);
  });

  it("warns about a thin map", () => {
    expect(reviewMap([row()]).warnings.join(" ")).toContain("thin maps");
  });

  it("warns when almost nothing is silent, because that map is of a web server", () => {
    const loud = Array.from({ length: 12 }, () => row({ silent: false }));
    expect(reviewMap(loud).warnings.join(" ")).toContain("silent failures");
  });

  it("warns when a row calls itself silent but scores easy to spot", () => {
    const rows = [row({ silent: true, blindness: 1 })];
    expect(reviewMap(rows).warnings.join(" ")).toContain("check one of the two");
  });
});

describe("taxonomy", () => {
  it("has nine layers, each with failures and the forgotten one", () => {
    expect(TAXONOMY).toHaveLength(9);
    expect(TAXONOMY.every((g) => g.failures.length > 0 && g.forgotten.length > 0)).toBe(true);
  });

  it("names the layers a map has not touched", () => {
    expect(uncoveredLayers(["input", "model"])).toContain("agent-loop");
    expect(uncoveredLayers(["input", "model"])).not.toContain("input");
  });

  it("looks a layer up, and refuses one it does not know", () => {
    expect(guideFor("retrieval").forgotten).toContain("tenant");
    // @ts-expect-error deliberately off the union, to prove the guard is real
    expect(() => guideFor("vibes")).toThrow();
  });
});
