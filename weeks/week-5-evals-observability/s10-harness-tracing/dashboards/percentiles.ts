/**
 * S10 · turning a pile of traces into the three numbers you defend.
 *
 * Cost, latency and quality, each with a line that pages someone. The arithmetic
 * is small; the two ways it goes wrong are not, and both are in here:
 *
 *   1. reporting the mean, which hides exactly the tail your users feel
 *   2. averaging percentiles across shards, which is not a percentile at all
 */
import type { Trace } from "../tracing/trace.ts";

/**
 * Nearest-rank percentile over the raw samples.
 *
 * Raw samples is the load-bearing word. You cannot compute this from another
 * service's p95: percentiles do not average. Keep the numbers, not the summaries.
 */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0; // an empty window is not a fast window
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

export interface Window {
  requests: number;
  costPerRequestUsd: number;
  costTotalUsd: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMean: number;
  passRate: number;
}

/**
 * One window of traffic, summarised. `graded` is the sampled subset your online
 * eval scored: quality is measured on a sample, cost and latency on everything.
 */
export function summarise(traces: Trace[], graded: { passed: number; scored: number }): Window {
  const latencies = traces.map((t) => t.ms);
  const costTotalUsd = traces.reduce((sum, t) => sum + t.costUsd, 0);

  return {
    requests: traces.length,
    costTotalUsd,
    costPerRequestUsd: traces.length ? costTotalUsd / traces.length : 0,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyMean: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    passRate: graded.scored ? graded.passed / graded.scored : 0,
  };
}

export interface AlertRule {
  metric: keyof Window;
  /** "above" for cost and latency, "below" for quality. */
  direction: "above" | "below";
  threshold: number;
  /** S6 taught the verb. Only one of these is allowed to wake a human. */
  action: "page" | "watch";
  /** Why this number and not a rounder one. A threshold you cannot defend gets muted. */
  because: string;
}

export interface Firing {
  metric: keyof Window;
  observed: number;
  threshold: number;
  action: AlertRule["action"];
  because: string;
}

/** Evaluate the window against the lines. No line, no alert, no matter how bad it looks. */
export function evaluateAlerts(window: Window, rules: AlertRule[], minRequests = 30): Firing[] {
  // A 3-request window will breach any percentile you like. Refusing to fire on
  // thin traffic is the difference between an alert and a nuisance.
  if (window.requests < minRequests) return [];

  return rules
    .filter((r) => {
      const observed = window[r.metric];
      return r.direction === "above" ? observed > r.threshold : observed < r.threshold;
    })
    .map((r) => ({
      metric: r.metric,
      observed: window[r.metric],
      threshold: r.threshold,
      action: r.action,
      because: r.because,
    }));
}
