import { describe, it, expect } from "vitest";
import { startTrace, replayGaps, redact, type Clock } from "./trace.ts";

/** A fake clock. Real time in a test buys you flake and nothing else. */
const fakeClock = (steps: number[]): Clock => {
  let i = 0;
  return () => steps[Math.min(i++, steps.length - 1)]!;
};

describe("startTrace", () => {
  it("sums cost and latency from the spans, so the totals cannot drift", async () => {
    const rec = startTrace("req_1", fakeClock([0, 0, 210, 210, 1400, 1830]));

    await rec.span("retrieve", "search_policies", async () => ["c1", "c2"], (chunks) => ({
      chunkIds: chunks.join(","),
    }));
    await rec.span("model", "answer", async () => "text", () => ({
      promptVersion: "answer@9f2c1b",
      tokensIn: 3120,
      tokensOut: 240,
      costUsd: 0.014,
    }));

    const trace = rec.end("ok");
    expect(trace.spans).toHaveLength(2);
    expect(trace.costUsd).toBeCloseTo(0.014);
    expect(trace.ms).toBe(1830);
    expect(trace.spans[0]!.ms).toBe(210);
  });

  it("records the span that threw, then rethrows", async () => {
    const rec = startTrace("req_2", fakeClock([0, 0, 90, 90]));

    await expect(
      rec.span("tool", "lookup_policy", async () => {
        throw new Error("upstream 503");
      }),
    ).rejects.toThrow("upstream 503");

    const trace = rec.end("error");
    // The run you most need to replay is the one that failed.
    expect(trace.spans[0]!.attrs.failed).toBe(true);
    expect(trace.spans[0]!.attrs.error).toBe("upstream 503");
    expect(trace.outcome).toBe("error");
  });
});

describe("replayGaps", () => {
  it("passes a trace a teammate could actually replay", async () => {
    const rec = startTrace("req_3", fakeClock([0]));
    await rec.span("retrieve", "search", async () => null, () => ({ chunkIds: "c1,c2" }));
    await rec.span("model", "answer", async () => null, () => ({
      promptVersion: "answer@9f2c1b",
      costUsd: 0.01,
    }));
    await rec.span("tool", "lookup_policy", async () => null, () => ({ ok: true }));

    expect(replayGaps(rec.end("ok"))).toEqual([]);
  });

  it("names every field a debugger would have to ask you for", async () => {
    const rec = startTrace("req_4", fakeClock([0]));
    await rec.span("model", "answer", async () => null); // no version, no cost
    await rec.span("tool", "charge_card", async () => null); // no ok flag

    const gaps = replayGaps(rec.end("ok"));
    expect(gaps).toHaveLength(3);
    expect(gaps.join(" ")).toContain("promptVersion");
    expect(gaps.join(" ")).toContain("charge_card");
  });

  it("fails an empty trace, which is the shape a log line gives you", () => {
    const gaps = replayGaps({ requestId: "", outcome: "ok", ms: 12, costUsd: 0, spans: [] });
    expect(gaps).toHaveLength(2);
  });
});

describe("redact", () => {
  it("strips the customer's data on the way out, once, at the seam", async () => {
    const rec = startTrace("req_5", fakeClock([0]));
    await rec.span("tool", "lookup_customer", async () => null, () => ({
      ok: true,
      query: "email ada@example.com",
    }));

    const clean = redact(rec.end("ok"), ["ada@example.com"]);
    expect(clean.spans[0]!.attrs.query).toBe("[redacted]");
    expect(clean.spans[0]!.attrs.ok).toBe(true); // the debuggable part survives
  });
});
