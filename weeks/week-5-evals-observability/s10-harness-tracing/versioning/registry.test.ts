import { describe, it, expect } from "vitest";
import { definePrompt, PromptRegistry, shouldPromote, type VersionScore } from "./registry.ts";

describe("definePrompt", () => {
  it("gives the same text the same id, every time and everywhere", () => {
    const a = definePrompt("answer", "You are a support agent.");
    const b = definePrompt("answer", "You are a support agent.");
    expect(a.id).toBe(b.id);
  });

  it("changes the id on a one-character edit, which is the whole trick", () => {
    const v1 = definePrompt("answer", "You are a support agent.");
    const v2 = definePrompt("answer", "You are a support agent. Be brief.");
    expect(v2.id).not.toBe(v1.id);
  });

  it("cannot be edited without the id moving, so a trace can never lie", () => {
    // The failure a hand-bumped "v13" gives you: edited text, unchanged label.
    const shipped = definePrompt("answer", "Answer from the policy only.");
    const edited = definePrompt("answer", "Answer from the policy only. Cite it.");
    expect(shipped.id).not.toBe(edited.id);
  });
});

describe("PromptRegistry", () => {
  it("resolves the exact bytes a six-month-old trace ran", () => {
    const reg = new PromptRegistry();
    const v1 = reg.register("answer", "Answer from the policy only.");
    reg.register("answer", "Answer from the policy only. Cite it.");

    expect(reg.get(v1.id)!.template).toBe("Answer from the policy only.");
    expect(reg.versionsOf("answer")).toHaveLength(2);
  });

  it("returns undefined for an id it never saw, instead of guessing", () => {
    expect(new PromptRegistry().get("answer@000000")).toBeUndefined();
  });
});

const incumbent: VersionScore = { id: "answer@aaa111", passRate: 0.88, costPerRequestUsd: 0.012, latencyP95: 2400 };

describe("shouldPromote", () => {
  it("promotes a clear quality win that costs no more", () => {
    const candidate: VersionScore = { ...incumbent, id: "answer@bbb222", passRate: 0.94 };
    expect(shouldPromote(candidate, incumbent).promote).toBe(true);
  });

  it("refuses a two-point bump that is inside the noise", () => {
    const candidate: VersionScore = { ...incumbent, id: "answer@ccc333", passRate: 0.895 };
    const verdict = shouldPromote(candidate, incumbent);
    expect(verdict.promote).toBe(false);
    expect(verdict.reasons[0]).toContain("noise");
  });

  it("refuses the longer prompt that buys quality with cost and tail", () => {
    const candidate: VersionScore = {
      id: "answer@ddd444",
      passRate: 0.95,
      costPerRequestUsd: 0.031, // few-shot examples on every single request
      latencyP95: 3900,
    };
    const verdict = shouldPromote(candidate, incumbent);
    expect(verdict.promote).toBe(false);
    expect(verdict.reasons).toHaveLength(2);
  });
});
