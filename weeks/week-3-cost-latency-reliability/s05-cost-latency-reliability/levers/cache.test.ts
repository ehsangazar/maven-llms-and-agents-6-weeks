import { describe, it, expect } from "vitest";
import {
  AnswerCache,
  answerCacheKey,
  orderForPrefixCache,
  savedByCache,
  sharedPrefixLength,
  type PromptParts,
} from "./cache.ts";

const parts: PromptParts = {
  systemAndTools: "You are a support assistant. Tools: search_docs, open_ticket.",
  retrieved: ["Refunds are processed within 5 working days.", "Shipping is free above 40 pounds."],
  history: [{ role: "user", content: "hi" }],
  question: "how long do refunds take?",
};

describe("prefix caching is an ordering problem", () => {
  it("puts the fixed instructions first and the volatile question last", () => {
    const messages = orderForPrefixCache(parts);
    expect(messages[0]?.content).toBe(parts.systemAndTools);
    expect(messages.at(-1)?.content).toBe(parts.question);
  });

  it("keeps the whole stable head shared when only the question changes", () => {
    const a = orderForPrefixCache(parts);
    const b = orderForPrefixCache({ ...parts, question: "where is my order?" });
    const stableHead = `system:${parts.systemAndTools}`;
    expect(sharedPrefixLength(a, b)).toBeGreaterThan(stableHead.length);
  });

  it("loses the prefix the moment retrieval order changes", () => {
    const a = orderForPrefixCache(parts);
    const reordered = orderForPrefixCache({ ...parts, retrieved: [...parts.retrieved].reverse() });
    const intact = sharedPrefixLength(a, orderForPrefixCache({ ...parts, question: "other" }));
    expect(sharedPrefixLength(a, reordered)).toBeLessThan(intact);
  });
});

describe("answerCacheKey", () => {
  it("normalises whitespace and case so trivial variants share an entry", () => {
    const base = { tenantId: "acme", contextVersion: "v3" };
    expect(answerCacheKey({ ...base, question: "  How LONG   do refunds take? " })).toBe(
      answerCacheKey({ ...base, question: "how long do refunds take?" }),
    );
  });

  it("keeps tenants apart, which is the whole reason the tenant is in the key", () => {
    const q = { question: "what is our discount?", contextVersion: "v3" };
    expect(answerCacheKey({ ...q, tenantId: "acme" })).not.toBe(
      answerCacheKey({ ...q, tenantId: "globex" }),
    );
  });

  it("separates corpus versions, so a re-index cannot serve yesterday's answer", () => {
    const q = { tenantId: "acme", question: "what is our discount?" };
    expect(answerCacheKey({ ...q, contextVersion: "v3" })).not.toBe(
      answerCacheKey({ ...q, contextVersion: "v4" }),
    );
  });

  it("refuses a key with no tenant instead of quietly building a leak", () => {
    expect(() => answerCacheKey({ tenantId: "", question: "q", contextVersion: "v1" })).toThrow();
  });
});

describe("AnswerCache", () => {
  const clock = (start = 0) => {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };

  it("serves the second identical request without touching the model", () => {
    const c = clock();
    const cache = new AnswerCache<string>(60_000, c.now);
    expect(cache.get("k")).toBeUndefined();
    cache.set("k", "5 working days");
    expect(cache.get("k")).toBe("5 working days");
    expect(cache.report()).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
  });

  it("expires an entry once its TTL is up", () => {
    const c = clock();
    const cache = new AnswerCache<string>(60_000, c.now);
    cache.set("k", "old policy");
    c.advance(60_000);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.report().expired).toBe(1);
  });

  it("reports entry age, because a stale answer fails silently", () => {
    const c = clock();
    const cache = new AnswerCache<string>(60_000, c.now);
    cache.set("k", "v");
    c.advance(1_500);
    expect(cache.ageMs("k")).toBe(1_500);
    expect(cache.ageMs("missing")).toBeUndefined();
  });

  it("starts at a zero hit rate rather than dividing by nothing", () => {
    expect(new AnswerCache<string>(1_000).report().hitRate).toBe(0);
  });
});

describe("savedByCache", () => {
  it("turns hit rate into money, linearly", () => {
    expect(savedByCache(0.027, 40_000, 0.4)).toBeCloseTo(432, 6);
  });
});
