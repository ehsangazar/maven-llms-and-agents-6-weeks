import { describe, it, expect } from "vitest";
import { isExecutable, lintEntry, type RunbookEntry } from "./runbook.ts";
import { LATENCY_ENTRY, RETRIEVAL_ENTRY } from "../example/support-assistant.ts";

const codes = (entry: RunbookEntry) => lintEntry(entry).map((s) => s.code);

describe("the worked entries", () => {
  it("the loud one is executable", () => {
    expect(lintEntry(LATENCY_ENTRY)).toEqual([]);
    expect(isExecutable(LATENCY_ENTRY)).toBe(true);
  });

  it("the silent one is executable too, and names a metric you had to build", () => {
    expect(lintEntry(RETRIEVAL_ENTRY)).toEqual([]);
    expect(RETRIEVAL_ENTRY.symptom).toContain("citation coverage");
  });

  it("both name a specific lever rather than an intention", () => {
    for (const entry of [LATENCY_ENTRY, RETRIEVAL_ENTRY]) {
      expect(entry.act.mitigation).toMatch(/flag|repoint|set /);
    }
  });
});

describe("the six smells", () => {
  it("catches a vague verb", () => {
    expect(codes({ ...LATENCY_ENTRY, act: { ...LATENCY_ENTRY.act, mitigation: "investigate and resolve" } }))
      .toContain("vague-verb");
  });

  it("catches an entry that needs its author", () => {
    expect(codes({ ...LATENCY_ENTRY, checks: ["ask Sam which flag to flip", "provider status page"] }))
      .toContain("needs-the-author");
  });

  it("catches a missing confirmation", () => {
    expect(codes({ ...LATENCY_ENTRY, act: { ...LATENCY_ENTRY.act, confirmedBy: "ok" } }))
      .toContain("no-confirmation");
  });

  it("catches diagnosis before mitigation", () => {
    expect(codes({ ...LATENCY_ENTRY, checks: ["find out why the model is slow", "provider status page"] }))
      .toContain("diagnosis-before-mitigation");
  });

  it("catches an unbounded check list", () => {
    expect(codes({ ...LATENCY_ENTRY, checks: ["a", "b", "c", "d", "e"] })).toContain("unbounded-checks");
  });

  it("catches no checks at all", () => {
    expect(codes({ ...LATENCY_ENTRY, checks: [] })).toContain("unbounded-checks");
  });

  it("catches a switch nobody has ever flipped", () => {
    expect(codes({ ...LATENCY_ENTRY, rehearsed: false })).toContain("never-rehearsed");
  });

  it("reports every smell an entry has, not just the first", () => {
    const bad: RunbookEntry = {
      failure: "it is slow",
      symptom: "things look bad",
      checks: [],
      act: { mitigation: "investigate and resolve", confirmedBy: "ok" },
      prevent: "monitor closely",
      rehearsed: false,
    };
    expect(codes(bad).sort()).toEqual(
      ["never-rehearsed", "no-confirmation", "unbounded-checks", "vague-verb"].sort(),
    );
    expect(isExecutable(bad)).toBe(false);
  });

  it("lets you set your own limit on the check list", () => {
    expect(codes({ ...LATENCY_ENTRY, checks: ["a", "b", "c", "d"] })).toContain("unbounded-checks");
    expect(lintEntry({ ...LATENCY_ENTRY, checks: ["a", "b", "c", "d"] }, { maxChecks: 4 })).toEqual([]);
  });
});
