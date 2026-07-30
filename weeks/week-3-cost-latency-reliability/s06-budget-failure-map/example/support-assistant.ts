/**
 * S6 · a worked Project 2, filled in.
 *
 * The support assistant from the lesson: a budget, a failure-mode map and two
 * runbook entries. It exists so you can see the depth being asked for, and so
 * the reviewers in this folder have something real to run against.
 *
 * Every number here traces to the arithmetic in S5: 7,200 input tokens and 350
 * output at the large tier is $0.027 a call, 130 questions a month against a
 * $20 seat puts a 10 percent revenue target at roughly one and a half cents.
 */

import type { RequestBudget } from "../budget/budget.ts";
import type { FailureRow } from "../failure-map/map.ts";
import type { RunbookEntry } from "../runbook/runbook.ts";

export const BUDGET: RequestBudget = {
  request: "user asks a question in the support widget",
  cost: {
    typical: { value: 0.015, confidence: "counted", note: "7,200 in + 350 out at the large tier, halved by the prefix cache" },
    worst: { value: 0.29, confidence: "counted", note: "escalation + 2 tool round-trips + 2 retries" },
    because: "10 percent of a $20 seat at 130 measured questions per seat per month",
  },
  latency: {
    ceilingMs: { value: 2_000, confidence: "measured" },
    firstTokenMs: { value: 700, confidence: "measured" },
    headroomFraction: 0.2,
    hops: [
      { name: "embed", budgetMs: 60 },
      { name: "search", budgetMs: 180 },
      { name: "rerank", budgetMs: 150 },
      { name: "assemble", budgetMs: 35 },
      { name: "model", budgetMs: 1_100 },
      { name: "validate", budgetMs: 45 },
    ],
  },
  calls: { typical: 2, hardMax: 6 },
  dominantCost: "input",
  leversOn: ["prefix cache 1h", "small model default", "4 chunks max", "stream", "400 max output tokens"],
};

export const FAILURE_MAP: FailureRow[] = [
  {
    layer: "data-privacy",
    failure: "cross-tenant cache hit",
    likelihood: 2,
    blast: 5,
    blindness: 5,
    silent: true,
    signal: "cache-key assertion failures, tenant mismatch counter",
    mitigation: { class: "prevent", how: "tenant id first in the cache key, asserted at read and at write" },
  },
  {
    layer: "retrieval",
    failure: "retrieval returns nothing relevant",
    likelihood: 4,
    blast: 3,
    blindness: 4,
    silent: true,
    signal: "zero-hit rate, citation coverage",
    mitigation: { class: "degrade", how: "no-context path: say so rather than answer from nothing" },
  },
  {
    layer: "model",
    failure: "confidently wrong answer",
    likelihood: 4,
    blast: 4,
    blindness: 3,
    silent: true,
    signal: "weekly golden-set eval score, thumbs-down rate",
    mitigation: { class: "detect", how: "schema validation now, trajectory evals in week 5" },
  },
  {
    layer: "context",
    failure: "context truncated mid-document",
    likelihood: 3,
    blast: 3,
    blindness: 4,
    silent: true,
    signal: "truncation counter per request",
    mitigation: { class: "prevent", how: "cap at 4 chunks and reject an over-long assembly before the call" },
  },
  {
    layer: "retrieval",
    failure: "answer cache serves a stale policy",
    likelihood: 3,
    blast: 3,
    blindness: 4,
    silent: true,
    signal: "cache age histogram",
    mitigation: { class: "prevent", how: "corpus version in the cache key, 1h TTL" },
  },
  {
    layer: "tools",
    failure: "tool side effect retried, double charge",
    likelihood: 2,
    blast: 5,
    blindness: 2,
    silent: false,
    signal: "duplicate-receipt counter",
    mitigation: { class: "prevent", how: "idempotency key derived from tenant, action and subject" },
  },
  {
    layer: "agent-loop",
    failure: "tool loop makes no progress and burns the budget",
    likelihood: 2,
    blast: 3,
    blindness: 3,
    silent: false,
    signal: "steps per request p95, spend per request p95",
    mitigation: { class: "prevent", how: "hard cap of 6 calls plus a per-request spend ceiling" },
  },
  {
    layer: "model",
    failure: "provider latency spike",
    likelihood: 4,
    blast: 2,
    blindness: 1,
    silent: false,
    signal: "p95 latency, breaker state",
    mitigation: { class: "degrade", how: "deadline, breaker, then the fallback ladder to the small model" },
  },
  {
    layer: "model",
    failure: "silent model version drift after a provider update",
    likelihood: 3,
    blast: 3,
    blindness: 5,
    silent: true,
    signal: "scheduled golden-set eval, model id recorded per request",
    mitigation: { class: "detect", how: "pin the model id in config and eval on a schedule, alert on score drop" },
  },
  {
    layer: "cost-capacity",
    failure: "one tenant burns the month's quota",
    likelihood: 3,
    blast: 4,
    blindness: 3,
    silent: true,
    signal: "spend per tenant per day",
    mitigation: { class: "prevent", how: "per-tenant daily spend cap, throttle at 10x the normal rate" },
  },
  {
    layer: "input",
    failure: "oversized paste blows the context window",
    likelihood: 3,
    blast: 2,
    blindness: 1,
    silent: false,
    signal: "rejected-input counter",
    mitigation: { class: "prevent", how: "cap input length at the edge, before any token is billed" },
  },
  {
    layer: "output",
    failure: "stray markdown in the rendered answer",
    likelihood: 3,
    blast: 1,
    blindness: 1,
    silent: false,
    mitigation: { class: "accept", how: "documented as accepted: cosmetic, and the renderer is being replaced" },
  },
];

/** The loud one. You will be paged for this. */
export const LATENCY_ENTRY: RunbookEntry = {
  failure: "model p95 latency spikes above 6s",
  symptom: "latency dashboard p95 crosses the alert line for 5 minutes, users report the assistant hanging",
  checks: [
    "provider status page",
    "tokens-per-request chart, has context bloated?",
    "retry rate and breaker state",
  ],
  act: {
    mitigation: "set flag llm.force_small_model=true in the config service",
    confirmedBy: "p95 back under 2s within 5 minutes on the latency dashboard",
  },
  escalation: "set flag llm.degraded_mode=true to serve cached and rules rungs only, then post to the status page",
  prevent: "hard per-request deadline with the fallback ladder underneath, cap retrieved context at 4 chunks",
  rehearsed: true,
};

/** The silent one. Latency stays green through the entire incident. */
export const RETRIEVAL_ENTRY: RunbookEntry = {
  failure: "retrieval quality collapses after a re-index",
  symptom: "zero-hit rate above 5 percent and citation coverage below 80 percent, with no errors and no latency change",
  checks: [
    "index doc count versus yesterday",
    "embedding model version in the ingest job",
    "run the 5 golden questions by hand",
  ],
  act: {
    mitigation: "repoint retriever.index_alias at the previous index snapshot",
    confirmedBy: "citation coverage back above 90 percent on the golden set",
  },
  escalation: "set flag retrieval.no_context_refuse=true so the assistant refuses rather than invents",
  prevent: "keep two index versions, gate the swap on a golden-set eval, pin the embedding model version in config",
  rehearsed: true,
};
