/**
 * LAB 1 — the spec.
 *
 * These tests fail against the starter. That is intended: they ARE the brief.
 * Implement the TODOs in `starter/router.ts` until `npm test` is green.
 *
 * Note what is NOT here: no API key, no network, no model. The router's
 * decisions are deterministic and therefore testable. The model is injected, so
 * the interesting logic (which tier, what happens when a tier fails, what it
 * cost) can be tested without paying anyone. If you can't test your routing
 * without calling a model, the seam is in the wrong place.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Classification, RouterDeps, Reply } from "./starter/router.ts";

/**
 * One spec, two implementations. `npm test` runs it against `starter/` — that
 * is the lab. `npm run test:solution` runs this exact suite against the
 * published reference, which is what stops the worked solution rotting as the
 * repo changes. Nothing below this line knows which one it is grading.
 */
type RouterModule = typeof import("./starter/router.ts");

const { chooseTier, validateReply, runRouter, Ledger, SAFE_DEFAULT, TIER_COST }: RouterModule =
  await import(process.env.LAB_IMPL === "solution" ? "./solution/router.ts" : "./starter/router.ts");

const classify = (over: Partial<Classification> = {}): Classification => ({
  category: "technical",
  complexity: "normal",
  reason: "test",
  ...over,
});

/** A deps object where every handler works. Override per test. */
const deps = (over: Partial<RouterDeps> = {}): RouterDeps => ({
  classify: async () => classify(),
  callModel: async () => ({ answer: "from the model", confident: true }),
  rules: () => ({ answer: "from the rules", confident: true }),
  ...over,
});

describe("chooseTier", () => {
  it("sends trivial requests to the rules handler", () => {
    expect(chooseTier(classify({ complexity: "trivial" }))).toBe("rules");
  });

  it("sends normal requests to the small model", () => {
    expect(chooseTier(classify({ complexity: "normal" }))).toBe("small");
  });

  it("sends hard requests to the large model", () => {
    expect(chooseTier(classify({ complexity: "hard" }))).toBe("large");
  });

  it("sends legal requests to the large model regardless of complexity", () => {
    // Risk, not difficulty. A trivial-looking legal question is still the one
    // you do not want the cheap model improvising on.
    expect(chooseTier(classify({ category: "legal", complexity: "trivial" }))).toBe("large");
    expect(chooseTier(classify({ category: "legal", complexity: "normal" }))).toBe("large");
  });
});

describe("validateReply", () => {
  it("accepts a well-formed reply", () => {
    expect(validateReply({ answer: "hi", confident: true })).toEqual({ answer: "hi", confident: true });
  });

  // These assert z.ZodError specifically, not just "it threw". A bare .toThrow()
  // would pass against the un-implemented stub — the TODO throws, so the test
  // goes green while nothing works. A test you can satisfy by doing nothing is
  // worse than no test: it lies to you.
  it("rejects a reply with no answer", () => {
    expect(() => validateReply({ answer: "", confident: true })).toThrow(z.ZodError);
  });

  it("rejects output that is the wrong shape entirely", () => {
    expect(() => validateReply("just a string")).toThrow(z.ZodError);
    expect(() => validateReply({ reply: "wrong key" })).toThrow(z.ZodError);
  });
});

describe("runRouter", () => {
  it("answers from the rules handler without calling a model", async () => {
    let modelCalls = 0;
    const reply = await runRouter(
      "hello",
      deps({
        classify: async () => classify({ complexity: "trivial" }),
        callModel: async () => {
          modelCalls++;
          return { answer: "nope", confident: true };
        },
      }),
      new Ledger(),
    );

    expect(reply.answer).toBe("from the rules");
    expect(modelCalls).toBe(0); // the cheapest call is the one you never make
  });

  it("escalates to the small model when the rules handler cannot answer", async () => {
    const ledger = new Ledger();
    const reply = await runRouter(
      "something rules can't do",
      deps({
        classify: async () => classify({ complexity: "trivial" }),
        rules: () => null,
      }),
      ledger,
    );

    expect(reply.answer).toBe("from the model");
    expect(ledger.attempts).toEqual([
      { tier: "rules", ok: false },
      { tier: "small", ok: true },
    ]);
  });

  it("escalates to the large model when the small model throws", async () => {
    const ledger = new Ledger();
    const reply = await runRouter(
      "flaky",
      deps({
        callModel: async (tier) => {
          if (tier === "small") throw new Error("upstream 503");
          return { answer: "from the large model", confident: true };
        },
      }),
      ledger,
    );

    expect(reply.answer).toBe("from the large model");
    expect(ledger.attempts).toEqual([
      { tier: "small", ok: false },
      { tier: "large", ok: true },
    ]);
  });

  it("escalates when a tier returns unvalidatable output", async () => {
    const reply = await runRouter(
      "garbage in",
      deps({
        callModel: async (tier) =>
          tier === "small" ? { wrong: "shape" } : { answer: "recovered", confident: true },
      }),
      new Ledger(),
    );

    expect(reply.answer).toBe("recovered");
  });

  it("escalates when a tier answers but is not confident", async () => {
    // An unconfident answer is a failure, not a result. This is the one people
    // miss: the call succeeded, so nothing threw, and the bad answer ships.
    const reply = await runRouter(
      "unsure",
      deps({
        callModel: async (tier) =>
          tier === "small"
            ? { answer: "erm, maybe?", confident: false }
            : { answer: "definitely this", confident: true },
      }),
      new Ledger(),
    );

    expect(reply.answer).toBe("definitely this");
  });

  it("degrades to a safe default when every tier fails", async () => {
    const ledger = new Ledger();
    const reply = await runRouter(
      "doomed",
      deps({
        classify: async () => classify({ complexity: "trivial" }),
        rules: () => null,
        callModel: async () => {
          throw new Error("everything is on fire");
        },
      }),
      ledger,
    );

    expect(reply).toEqual(SAFE_DEFAULT);
    expect(ledger.attempts.every((a) => !a.ok)).toBe(true);
  });
});

describe("Ledger.report", () => {
  it("reports zero for an empty ledger without dividing by zero", () => {
    const r = new Ledger().report();
    expect(r.totalCost).toBe(0);
    expect(r.byTier.small.share).toBe(0);
  });

  it("counts traffic share per tier", () => {
    const ledger = new Ledger();
    ledger.record("rules", true);
    ledger.record("rules", true);
    ledger.record("small", true);
    ledger.record("large", true);

    const r = ledger.report();
    expect(r.byTier.rules.attempts).toBe(2);
    expect(r.byTier.rules.share).toBeCloseTo(0.5);
    expect(r.byTier.small.share).toBeCloseTo(0.25);
  });

  it("bills failed attempts too, because you paid for them", () => {
    const ledger = new Ledger();
    ledger.record("small", false); // fell off this rung, still cost money
    ledger.record("large", true);

    const r = ledger.report();
    expect(r.totalCost).toBeCloseTo(TIER_COST.small + TIER_COST.large);
  });

  it("shows the routing win: cheap tiers absorbing the traffic", () => {
    const ledger = new Ledger();
    for (let i = 0; i < 90; i++) ledger.record("small", true);
    for (let i = 0; i < 10; i++) ledger.record("large", true);

    const r = ledger.report();
    const allLarge = 100 * TIER_COST.large;
    expect(r.totalCost).toBeLessThan(allLarge / 2); // routing more than halves it
  });
});
