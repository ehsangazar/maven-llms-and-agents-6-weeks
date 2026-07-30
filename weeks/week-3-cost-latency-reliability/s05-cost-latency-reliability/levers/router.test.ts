import { describe, it, expect } from "vitest";
import { escalationRate, route, servedByMix, type RouterDeps, type Served } from "./router.ts";

const deps = (over: Partial<RouterDeps> = {}): RouterDeps => ({
  rules: (q) => (/opening hours/i.test(q) ? "We are open 9 to 5, Monday to Friday." : undefined),
  small: async () => ({ text: "small answer", confident: true }),
  large: async () => ({ text: "large answer", confident: true }),
  ...over,
});

describe("route", () => {
  it("answers from rules without touching a model at all", async () => {
    let modelCalled = false;
    const out = await route(
      "what are your opening hours?",
      deps({ small: async () => ((modelCalled = true), { text: "x", confident: true }) }),
    );
    expect(out.servedBy).toBe("rules");
    expect(modelCalled).toBe(false);
  });

  it("uses the small model by default and stops there when it is confident", async () => {
    const out = await route("how do refunds work?", deps());
    expect(out.servedBy).toBe("small");
    expect(out.escalatedFrom).toEqual(["rules"]);
  });

  it("escalates when the small model is not confident", async () => {
    const out = await route(
      "why was my invoice recalculated?",
      deps({ small: async () => ({ text: "not sure", confident: false }) }),
    );
    expect(out.servedBy).toBe("large");
    expect(out.text).toBe("large answer");
    expect(out.escalatedFrom).toEqual(["rules", "small"]);
  });

  it("skips a tier it knows will escalate anyway", async () => {
    let smallCalled = false;
    const out = await route("a".repeat(5_000), deps({ small: async () => ((smallCalled = true), { text: "x", confident: true }) }), {
      escalateOverChars: 2_000,
    });
    expect(smallCalled).toBe(false);
    expect(out.servedBy).toBe("large");
  });

  it("right-sizes the output: each tier gets a cap, and they are not the same cap", async () => {
    const caps: number[] = [];
    await route(
      "explain the refund policy",
      deps({
        small: async (_q, cap) => (caps.push(cap), { text: "", confident: false }),
        large: async (_q, cap) => (caps.push(cap), { text: "ok", confident: true }),
      }),
      { smallMaxOutputTokens: 200, largeMaxOutputTokens: 800 },
    );
    expect(caps).toEqual([200, 800]);
  });
});

describe("the router grading itself", () => {
  const served = (servedBy: Served["servedBy"]): Served => ({ text: "", servedBy, escalatedFrom: [] });

  it("reports the escalation rate", () => {
    expect(escalationRate([served("small"), served("small"), served("large"), served("rules")])).toBe(0.25);
  });

  it("reports zero rather than dividing by nothing", () => {
    expect(escalationRate([])).toBe(0);
  });

  it("reports the served-by mix, so silent degradation is visible", () => {
    expect(servedByMix([served("rules"), served("small"), served("small")])).toEqual({
      rules: 1,
      small: 2,
      large: 0,
    });
  });
});
