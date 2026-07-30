import { describe, it, expect } from "vitest";
import {
  MemoryEffectStore,
  createOnce,
  idempotencyKey,
  stableHash,
  type Intent,
} from "./idempotency.ts";

const charge: Intent = { tenantId: "acme", action: "charge", subject: "order-8812" };

describe("idempotencyKey", () => {
  it("is stable across attempts of the same intent", () => {
    expect(idempotencyKey(charge)).toBe(idempotencyKey({ ...charge }));
  });

  it("does not depend on the order the discriminators were written in", () => {
    const a = idempotencyKey({ ...charge, discriminators: { amount: 4200, currency: "GBP" } });
    const b = idempotencyKey({ ...charge, discriminators: { currency: "GBP", amount: 4200 } });
    expect(a).toBe(b);
  });

  it("separates genuinely different requests", () => {
    expect(idempotencyKey(charge)).not.toBe(idempotencyKey({ ...charge, subject: "order-8813" }));
    expect(idempotencyKey(charge)).not.toBe(idempotencyKey({ ...charge, tenantId: "globex" }));
    expect(idempotencyKey(charge)).not.toBe(
      idempotencyKey({ ...charge, discriminators: { amount: 4200 } }),
    );
  });

  it("changes on every attempt if you key on the attempt, which is the bug", () => {
    const attemptKeyed = (n: number) =>
      idempotencyKey({ ...charge, discriminators: { attempt: n } });
    expect(attemptKeyed(1)).not.toBe(attemptKeyed(2)); // and so both attempts charge
  });

  it("refuses a key with no tenant", () => {
    expect(() => idempotencyKey({ ...charge, tenantId: "" })).toThrow();
  });
});

describe("stableHash", () => {
  it("is deterministic and differs for different inputs", () => {
    expect(stableHash("a")).toBe(stableHash("a"));
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });
});

describe("once", () => {
  it("performs the effect the first time", async () => {
    const store = new MemoryEffectStore<string>();
    const once = createOnce(store);
    const out = await once("k", async () => "receipt-1");
    expect(out).toEqual({ value: "receipt-1", performed: true });
  });

  it("replays the first result on a retry instead of charging twice", async () => {
    const store = new MemoryEffectStore<string>();
    const once = createOnce(store);
    let charges = 0;

    const effect = async () => `receipt-${++charges}`;
    const first = await once("k", effect);
    const retried = await once("k", effect);

    expect(charges).toBe(1);
    expect(retried.value).toBe(first.value);
    expect(retried.performed).toBe(false);
  });

  it("collapses concurrent retries, which is how they actually arrive", async () => {
    const store = new MemoryEffectStore<string>();
    const once = createOnce(store);
    let charges = 0;

    const slow = async () => {
      charges++;
      await new Promise((r) => setTimeout(r, 5));
      return "receipt";
    };

    const [a, b, c] = await Promise.all([once("k", slow), once("k", slow), once("k", slow)]);
    expect(charges).toBe(1);
    expect([a.value, b.value, c.value]).toEqual(["receipt", "receipt", "receipt"]);
    expect([a.performed, b.performed, c.performed].filter(Boolean)).toHaveLength(1);
  });

  it("keeps different keys independent", async () => {
    const store = new MemoryEffectStore<string>();
    const once = createOnce(store);
    await once("k1", async () => "one");
    const out = await once("k2", async () => "two");
    expect(out).toEqual({ value: "two", performed: true });
    expect(store.size).toBe(2);
  });

  it("does not record a failed effect, so a genuine retry can still succeed", async () => {
    const store = new MemoryEffectStore<string>();
    const once = createOnce(store);
    await expect(once("k", async () => { throw new Error("provider 503"); })).rejects.toThrow();
    const out = await once("k", async () => "receipt");
    expect(out).toEqual({ value: "receipt", performed: true });
  });
});
