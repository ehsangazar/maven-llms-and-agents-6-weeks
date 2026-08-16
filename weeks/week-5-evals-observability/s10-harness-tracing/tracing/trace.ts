/**
 * S10 · the trace recorder. One request in, one replayable object out.
 *
 * The whole session hangs on this file. A trace is not a log stream: it is a
 * single structured object per request, with one span per step, that carries
 * enough for a teammate to reconstruct the run without asking you what happened.
 *
 * Pure and deps-injected (the clock is a parameter), so it is testable with no
 * API key and no wall-clock flake.
 */

export type Outcome = "ok" | "error" | "refused" | "degraded";

export interface Span {
  type: "retrieve" | "model" | "tool";
  name: string;
  ms: number;
  /** Cost attributable to this span. Retrieval and tools are usually 0. */
  costUsd: number;
  /** Anything span-specific: prompt version, token counts, chunk count, ok/failed. */
  attrs: Record<string, string | number | boolean>;
}

export interface Trace {
  requestId: string;
  outcome: Outcome;
  ms: number;
  costUsd: number;
  spans: Span[];
}

/** The clock, injected. Tests pass a fake; production passes `() => Date.now()`. */
export type Clock = () => number;

export interface Recorder {
  /** Time one step and record it. Rethrows after recording, so a failure is still traced. */
  span<T>(
    type: Span["type"],
    name: string,
    fn: () => Promise<T>,
    attrs?: (result: T) => Record<string, string | number | boolean>,
  ): Promise<T>;
  /** Close the trace. Totals are summed from the spans, never reported separately. */
  end(outcome: Outcome): Trace;
}

export function startTrace(requestId: string, now: Clock): Recorder {
  const spans: Span[] = [];
  const t0 = now();

  return {
    async span(type, name, fn, attrs) {
      const start = now();
      try {
        const result = await fn();
        const extra = attrs?.(result) ?? {};
        // Cost rides on the span, not on a separate meter. If it is not here,
        // no dashboard can ever attribute spend to a step.
        const { costUsd, ...rest } = extra as { costUsd?: number };
        spans.push({ type, name, ms: now() - start, costUsd: costUsd ?? 0, attrs: rest });
        return result;
      } catch (err) {
        // The failing run is the one you most need to replay. Record, then rethrow.
        spans.push({
          type,
          name,
          ms: now() - start,
          costUsd: 0,
          attrs: { failed: true, error: String(err instanceof Error ? err.message : err) },
        });
        throw err;
      }
    },

    end(outcome) {
      return {
        requestId,
        outcome,
        ms: now() - t0,
        costUsd: spans.reduce((sum, s) => sum + s.costUsd, 0),
        spans,
      };
    },
  };
}

/**
 * The replay test, as a function. A trace passes if a teammate could reconstruct
 * the run from it alone: which prompt version ran, what the model was given, what
 * every tool returned, and what it cost.
 *
 * Returns the missing fields, so a failing trace tells you what to add.
 */
export function replayGaps(trace: Trace): string[] {
  const gaps: string[] = [];
  if (!trace.requestId) gaps.push("requestId: you cannot find the user's run without it");
  if (trace.spans.length === 0) gaps.push("spans: a trace with no steps is a timestamp");

  for (const s of trace.spans) {
    if (s.type === "model" && s.attrs.promptVersion === undefined) {
      gaps.push(`${s.name}: no promptVersion, so you cannot tell which prompt produced this`);
    }
    if (s.type === "model" && s.costUsd === 0) {
      gaps.push(`${s.name}: model call costing 0, so spend cannot be attributed`);
    }
    if (s.type === "tool" && s.attrs.ok === undefined) {
      gaps.push(`${s.name}: no ok flag, so a silent tool failure is invisible`);
    }
    if (s.type === "retrieve" && s.attrs.chunkIds === undefined) {
      gaps.push(`${s.name}: no chunkIds, so you cannot re-read what the model was given`);
    }
  }
  return gaps;
}

/**
 * The seam that keeps traces legal. Redaction happens on the way out, once, so
 * no call site can forget it. Swap this for your own PII policy.
 */
export function redact(trace: Trace, sensitive: string[]): Trace {
  const clean = (v: string | number | boolean) =>
    typeof v === "string" && sensitive.some((s) => s && v.includes(s)) ? "[redacted]" : v;

  return {
    ...trace,
    spans: trace.spans.map((s) => ({
      ...s,
      attrs: Object.fromEntries(Object.entries(s.attrs).map(([k, v]) => [k, clean(v)])),
    })),
  };
}
