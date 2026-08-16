/**
 * S10 · where a person stays in the loop, and what their correction is worth.
 *
 * Human review is a budget, not a principle. You can afford to look at a few
 * percent of traffic, so the only question is which few percent. Route on stakes
 * first (irreversible actions always), then on the low-confidence tail.
 *
 * The second half is the part teams skip: a correction that does not become a
 * test case is a favour you did one customer, once.
 */
import type { Trace } from "../tracing/trace.ts";

export type Route = "auto" | "review";

export interface RoutePolicy {
  /** Tools whose effects you cannot undo. These never ship unreviewed. */
  irreversibleTools: string[];
  /** Below this, a human looks. Set it from your review capacity, not from a feeling. */
  minConfidence: number;
}

export interface Decision {
  route: Route;
  reason: string;
}

export function routeForReview(
  trace: Trace,
  confidence: number,
  policy: RoutePolicy,
): Decision {
  const irreversible = trace.spans.find(
    (s) => s.type === "tool" && policy.irreversibleTools.includes(s.name),
  );
  // Stakes beat confidence. A confident refund is still a refund.
  if (irreversible) return { route: "review", reason: `irreversible: ${irreversible.name}` };

  if (confidence < policy.minConfidence) {
    return { route: "review", reason: `low confidence: ${confidence.toFixed(2)}` };
  }
  return { route: "auto", reason: "reversible and confident" };
}

/**
 * Pick the confidence line from what your reviewers can actually get through.
 * Sorting the sample and cutting at the capacity mark beats guessing 0.7.
 */
export function calibrateThreshold(sampleConfidences: number[], reviewCapacity: number): number {
  if (sampleConfidences.length === 0 || reviewCapacity <= 0) return 0;
  const sorted = [...sampleConfidences].sort((a, b) => a - b);
  const budget = Math.min(Math.floor(sampleConfidences.length * reviewCapacity), sorted.length - 1);
  return sorted[Math.max(budget, 0)]!;
}

export interface EvalCase {
  name: string;
  input: string;
  expect: string;
  source: "human-correction";
  traceId: string;
}

/**
 * The loop that pays for the reviewers. Every correction becomes a permanent
 * case, so the same mistake can never reach production twice.
 */
export function correctionToCase(
  trace: Trace,
  input: string,
  corrected: string,
): EvalCase {
  return {
    name: `correction-${trace.requestId}`,
    input,
    expect: corrected,
    source: "human-correction",
    traceId: trace.requestId,
  };
}
