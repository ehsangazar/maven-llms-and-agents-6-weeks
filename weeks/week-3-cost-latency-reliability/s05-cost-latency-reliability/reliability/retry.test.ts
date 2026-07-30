import { describe, it, expect } from "vitest";
import {
  backoffMs,
  classifyStatus,
  isRetryable,
  retry,
  type ClassifiedError,
  type FailureKind,
} from "./retry.ts";

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const classify = (err: unknown): ClassifiedError =>
  err instanceof HttpError
    ? { kind: classifyStatus(err.status), status: err.status }
    : { kind: "connection" };

const noSleep = async () => {};
const fixedRandom = (v: number) => () => v;

describe("classification", () => {
  it("maps statuses to kinds by contract, not by message text", () => {
    expect(classifyStatus(429)).toBe("rate-limit");
    expect(classifyStatus(503)).toBe("server");
    expect(classifyStatus(401)).toBe("auth");
    expect(classifyStatus(400)).toBe("bad-request");
  });

  it("retries the three transient kinds and the timeout, nothing else", () => {
    const retryable: FailureKind[] = ["rate-limit", "server", "connection", "timeout"];
    const fatal: FailureKind[] = ["bad-request", "auth", "content-filter"];
    expect(retryable.every(isRetryable)).toBe(true);
    expect(fatal.some(isRetryable)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially up to the cap", () => {
    // random() at its maximum picks the top of the window, so this is the ceiling itself
    const opts = { baseMs: 100, capMs: 2_000, random: fixedRandom(1) };
    expect(backoffMs(1, opts)).toBe(100);
    expect(backoffMs(2, opts)).toBe(200);
    expect(backoffMs(3, opts)).toBe(400);
    expect(backoffMs(9, opts)).toBe(2_000); // capped
  });

  it("picks anywhere beneath the ceiling, not just the ceiling", () => {
    const opts = { baseMs: 100, capMs: 2_000, random: fixedRandom(0.25) };
    expect(backoffMs(3, opts)).toBe(100); // a quarter of the 400ms window
  });

  it("jitters: the same attempt does not always wait the same time", () => {
    const opts = { baseMs: 100, capMs: 2_000 };
    expect(backoffMs(3, { ...opts, random: fixedRandom(0.1) })).not.toBe(
      backoffMs(3, { ...opts, random: fixedRandom(0.9) }),
    );
  });

  it("counts attempts from one", () => {
    expect(() => backoffMs(0, { baseMs: 100, capMs: 1_000 })).toThrow();
  });
});

describe("retry", () => {
  const opts = {
    attempts: 3,
    backoff: { baseMs: 100, capMs: 1_000, random: fixedRandom(0.5) },
    sleep: noSleep,
  };

  it("returns on the first success without waiting", async () => {
    const out = await retry(async () => "ok", classify, opts);
    expect(out).toMatchObject({ value: "ok", attempts: 1, waitedMs: 0 });
  });

  it("retries a 503 and succeeds on the next attempt", async () => {
    const out = await retry(
      async (attempt) => {
        if (attempt === 1) throw new HttpError(503);
        return "recovered";
      },
      classify,
      opts,
    );
    expect(out.value).toBe("recovered");
    expect(out.attempts).toBe(2);
    expect(out.waitedMs).toBeGreaterThan(0);
  });

  it("does not retry a 400, because retrying your own bug just costs more", async () => {
    let calls = 0;
    await expect(
      retry(async () => { calls++; throw new HttpError(400); }, classify, opts),
    ).rejects.toThrow("HTTP 400");
    expect(calls).toBe(1);
  });

  it("gives up after the attempt budget and rethrows the real error", async () => {
    let calls = 0;
    await expect(
      retry(async () => { calls++; throw new HttpError(429); }, classify, opts),
    ).rejects.toThrow("HTTP 429");
    expect(calls).toBe(3);
  });

  it("refuses a retry the request has no time left to finish", async () => {
    let calls = 0;
    await expect(
      retry(async () => { calls++; throw new HttpError(503); }, classify, {
        ...opts,
        attemptCostMs: 800,
        remainingMs: () => 120,
      }),
    ).rejects.toThrow("HTTP 503");
    expect(calls).toBe(1);
  });

  it("reports each retry, so the retry rate is a metric and not a mystery", async () => {
    const seen: string[] = [];
    await retry(
      async (attempt) => {
        if (attempt < 3) throw new HttpError(attempt === 1 ? 429 : 500);
        return "ok";
      },
      classify,
      { ...opts, onRetry: (i) => seen.push(i.kind) },
    );
    expect(seen).toEqual(["rate-limit", "server"]);
  });

  it("refuses a nonsensical attempt budget", async () => {
    await expect(retry(async () => "x", classify, { ...opts, attempts: 0 })).rejects.toThrow();
  });
});
