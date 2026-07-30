import { describe, it, expect } from "vitest";
import { BreakerOpenError, CircuitBreaker } from "./breaker.ts";

const clock = (start = 0) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

const boom = async (): Promise<never> => {
  throw new Error("503");
};

describe("CircuitBreaker", () => {
  it("stays closed while calls succeed", async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: clock().now });
    await expect(b.run(async () => "ok")).resolves.toBe("ok");
    expect(b.current()).toBe("closed");
  });

  it("trips after the threshold of consecutive failures", async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: clock().now });
    for (let i = 0; i < 3; i++) await expect(b.run(boom)).rejects.toThrow("503");
    expect(b.current()).toBe("open");
  });

  it("resets the count on a success, so a flaky call does not trip it", async () => {
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: clock().now });
    await expect(b.run(boom)).rejects.toThrow();
    await expect(b.run(boom)).rejects.toThrow();
    await b.run(async () => "ok");
    await expect(b.run(boom)).rejects.toThrow();
    expect(b.current()).toBe("closed");
  });

  it("short-circuits without calling the dependency at all", async () => {
    const c = clock();
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: c.now });
    await expect(b.run(boom)).rejects.toThrow("503");

    let called = false;
    await expect(b.run(async () => ((called = true), "ok"))).rejects.toBeInstanceOf(BreakerOpenError);
    expect(called).toBe(false);
  });

  it("tells you how long until it probes again", async () => {
    const c = clock();
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: c.now });
    await expect(b.run(boom)).rejects.toThrow();
    c.advance(400);
    await b.run(async () => "x").catch((err: BreakerOpenError) => {
      expect(err.retryAfterMs).toBe(600);
    });
  });

  it("half-opens after the cooldown and closes on a good probe", async () => {
    const c = clock();
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: c.now });
    await expect(b.run(boom)).rejects.toThrow();
    c.advance(1_000);
    expect(b.current()).toBe("half-open");
    await expect(b.run(async () => "back")).resolves.toBe("back");
    expect(b.current()).toBe("closed");
  });

  it("reopens immediately when the probe fails, without burning the threshold again", async () => {
    const c = clock();
    const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000, now: c.now });
    for (let i = 0; i < 3; i++) await expect(b.run(boom)).rejects.toThrow();
    c.advance(1_000);
    expect(b.current()).toBe("half-open");
    await expect(b.run(boom)).rejects.toThrow("503");
    expect(b.current()).toBe("open");
  });

  it("can require several good probes before trusting the dependency again", async () => {
    const c = clock();
    const b = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 500,
      successThreshold: 2,
      now: c.now,
    });
    await expect(b.run(boom)).rejects.toThrow();
    c.advance(500);
    await b.run(async () => "probe 1");
    expect(b.current()).toBe("half-open");
    await b.run(async () => "probe 2");
    expect(b.current()).toBe("closed");
  });

  it("refuses a threshold that would trip on nothing", () => {
    expect(() => new CircuitBreaker({ failureThreshold: 0, cooldownMs: 100 })).toThrow();
  });
});
