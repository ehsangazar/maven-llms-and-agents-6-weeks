import { describe, it, expect } from "vitest";
import { createBatcher, type Scheduler } from "./batcher.ts";

/** A scheduler you fire by hand, so "maxWaitMs elapsed" is a function call. */
function manualScheduler() {
  let pending: (() => void) | undefined;
  const scheduler: Scheduler = (fn) => {
    pending = fn;
    return { cancel: () => (pending = undefined) };
  };
  return {
    scheduler,
    armed: () => pending !== undefined,
    fire: () => {
      const fn = pending;
      pending = undefined;
      fn?.();
    },
  };
}

describe("createBatcher", () => {
  it("flushes on size, before the timer has any say", async () => {
    const batches: string[][] = [];
    const clock = manualScheduler();
    const b = createBatcher<string, string>({
      maxSize: 3,
      maxWaitMs: 50,
      scheduler: clock.scheduler,
      run: async (items) => (batches.push(items), items.map((i) => i.toUpperCase())),
    });

    const out = await Promise.all([b.submit("a"), b.submit("b"), b.submit("c")]);
    expect(out).toEqual(["A", "B", "C"]);
    expect(batches).toEqual([["a", "b", "c"]]);
  });

  it("flushes on time when the batch never fills", async () => {
    const clock = manualScheduler();
    const b = createBatcher<number, number>({
      maxSize: 10,
      maxWaitMs: 50,
      scheduler: clock.scheduler,
      run: async (items) => items.map((i) => i * 2),
    });

    const p = b.submit(21);
    expect(clock.armed()).toBe(true);
    expect(b.queueDepth()).toBe(1);
    clock.fire();
    await expect(p).resolves.toBe(42);
  });

  it("keeps results lined up with the items that asked for them", async () => {
    const clock = manualScheduler();
    const b = createBatcher<string, number>({
      maxSize: 3,
      maxWaitMs: 50,
      scheduler: clock.scheduler,
      run: async (items) => items.map((i) => i.length),
    });
    const out = await Promise.all([b.submit("a"), b.submit("bbbb"), b.submit("cc")]);
    expect(out).toEqual([1, 4, 2]);
  });

  it("rejects every caller when the batch itself fails, instead of stranding them", async () => {
    const clock = manualScheduler();
    const b = createBatcher<string, string>({
      maxSize: 2,
      maxWaitMs: 50,
      scheduler: clock.scheduler,
      run: async () => { throw new Error("provider 503"); },
    });
    const results = await Promise.allSettled([b.submit("a"), b.submit("b")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("treats a short result array as a failure rather than resolving with undefined", async () => {
    const clock = manualScheduler();
    const b = createBatcher<string, string>({
      maxSize: 2,
      maxWaitMs: 50,
      scheduler: clock.scheduler,
      run: async () => ["only one"],
    });
    await expect(Promise.all([b.submit("a"), b.submit("b")])).rejects.toThrow(/2 items/);
  });

  it("flushes on demand, for shutdown", async () => {
    const clock = manualScheduler();
    const b = createBatcher<number, number>({
      maxSize: 100,
      maxWaitMs: 5_000,
      scheduler: clock.scheduler,
      run: async (items) => items,
    });
    const p = b.submit(7);
    await b.flush();
    await expect(p).resolves.toBe(7);
    expect(b.queueDepth()).toBe(0);
  });

  it("does nothing on an empty flush", async () => {
    let ran = false;
    const b = createBatcher<number, number>({
      maxSize: 2,
      maxWaitMs: 10,
      run: async (items) => ((ran = true), items),
    });
    await b.flush();
    expect(ran).toBe(false);
  });

  it("refuses a configuration that cannot batch", () => {
    expect(() => createBatcher({ maxSize: 0, maxWaitMs: 10, run: async (i) => i })).toThrow();
    expect(() => createBatcher({ maxSize: 2, maxWaitMs: -1, run: async (i) => i })).toThrow();
  });
});
