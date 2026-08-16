/**
 * S10 · the whole harness in one run. No API key needed.
 *
 * Trace a request, replay-test the trace, roll a window of traffic into the
 * three dashboard numbers, evaluate the alert lines, and route the risky run to
 * a human. Every piece is the file it came from, nothing is faked for the demo.
 *
 * Run it:  npm run lab weeks/week-5-evals-observability/s10-harness-tracing/demo.ts
 */
import { startTrace, replayGaps, redact, type Trace } from "./tracing/trace.ts";
import { summarise, evaluateAlerts, type AlertRule } from "./dashboards/percentiles.ts";
import { PromptRegistry, shouldPromote } from "./versioning/registry.ts";
import { routeForReview, correctionToCase, type RoutePolicy } from "./hitl/route.ts";

const registry = new PromptRegistry();
const answerV1 = registry.register("answer", "Answer from the retrieved policy only.");
const answerV2 = registry.register("answer", "Answer from the retrieved policy only. Cite the clause.");

/** A deterministic clock, so the demo prints the same trace every time. */
const scriptedClock = (steps: number[]) => {
  let i = 0;
  return () => steps[Math.min(i++, steps.length - 1)]!;
};

async function handleRequest(id: string, slow: boolean): Promise<Trace> {
  const t = slow ? 9_000 : 400;
  const rec = startTrace(id, scriptedClock([0, 0, 180, 180, t - 60, t - 60, t, t]));

  await rec.span("retrieve", "search_policies", async () => ["pol_14", "pol_31"], (chunks) => ({
    chunkIds: chunks.join(","),
  }));
  await rec.span("model", "answer", async () => "You are covered under clause 14.", () => ({
    promptVersion: answerV1.id,
    tokensIn: 3120,
    tokensOut: 240,
    costUsd: 0.014,
  }));
  await rec.span("tool", "issue_refund", async () => ({ ref: "rf_902" }), () => ({ ok: true }));

  return rec.end("ok");
}

// ---- 1 · one request, traced and replay-tested ------------------------------
const one = await handleRequest("req_8f2a", false);
console.log("TRACE", JSON.stringify(redact(one, ["ada@example.com"]), null, 2));
console.log("replay gaps:", replayGaps(one).length === 0 ? "none, this run is replayable" : replayGaps(one));

// ---- 2 · a window of traffic, rolled into the three numbers -----------------
const window_ = summarise(
  await Promise.all(
    Array.from({ length: 100 }, (_, i) => handleRequest(`req_${i}`, i >= 88)), // 12% slow
  ),
  { passed: 9, scored: 10 },
);
console.log("\nWINDOW", {
  requests: window_.requests,
  costPerRequestUsd: +window_.costPerRequestUsd.toFixed(4),
  latencyMean: Math.round(window_.latencyMean),
  latencyP50: window_.latencyP50,
  latencyP95: window_.latencyP95,
  passRate: window_.passRate,
});

const rules: AlertRule[] = [
  { metric: "costPerRequestUsd", direction: "above", threshold: 0.02, action: "watch", because: "the Week 3 budget priced this request at 2 cents" },
  { metric: "latencyP95", direction: "above", threshold: 3_000, action: "page", because: "Project 2's deadline split gave the model 3 seconds" },
  { metric: "passRate", direction: "below", threshold: 0.9, action: "page", because: "below 0.9 the online set has caught a real regression" },
];
console.log("FIRING", evaluateAlerts(window_, rules));
console.log("note: the mean says", Math.round(window_.latencyMean), "ms and nothing is wrong. The p95 pages someone.");

// ---- 3 · should the new prompt ship? ---------------------------------------
console.log(
  "\nPROMOTE",
  answerV2.id,
  shouldPromote(
    { id: answerV2.id, passRate: 0.93, costPerRequestUsd: 0.019, latencyP95: 2_600 },
    { id: answerV1.id, passRate: 0.88, costPerRequestUsd: 0.014, latencyP95: 2_400 },
  ),
);

// ---- 4 · who does a human look at? -----------------------------------------
const policy: RoutePolicy = { irreversibleTools: ["issue_refund", "delete_account"], minConfidence: 0.7 };
console.log("\nROUTE", routeForReview(one, 0.97, policy)); // confident, but it moved money
console.log("CASE ", correctionToCase(one, "I was charged twice", "billing"));
