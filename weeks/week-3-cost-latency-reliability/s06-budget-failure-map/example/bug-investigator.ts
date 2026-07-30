/**
 * S6 · a second worked Project 2, for the tool that investigates your incidents.
 *
 * The support assistant next door is the everyday case. This one is more
 * interesting, because the blast radius of an on-call assistant is measured in
 * minutes added to an outage: a confidently wrong cause does not just fail to
 * help, it actively costs time at the worst possible moment.
 *
 * It maps the investigator built in
 * [S5 real-world](../../s05-cost-latency-reliability/real-world/investigate.ts).
 */

import type { RequestBudget } from "../budget/budget.ts";
import type { FailureRow } from "../failure-map/map.ts";
import type { RunbookEntry } from "../runbook/runbook.ts";

export const INVESTIGATOR_BUDGET: RequestBudget = {
  request: "on-call opens a page and asks the assistant what happened",
  cost: {
    typical: { value: 0.04, confidence: "counted", note: "1 ask at 20 capped log lines, plus 2 searches" },
    worst: { value: 0.2, confidence: "counted", note: "3 asks, the step cap, before the spend ceiling bites" },
    because:
      "roughly 400 investigations a month is $16, against one engineer-hour, so the ceiling is set by staying obviously cheaper than the time it saves",
  },
  latency: {
    ceilingMs: { value: 10_000, confidence: "measured", note: "on-call is watching a page, not a spinner" },
    headroomFraction: 0.2,
    hops: [
      { name: "list-deploys", budgetMs: 400 },
      { name: "search-logs", budgetMs: 1_800 },
      { name: "assemble", budgetMs: 100 },
      { name: "model", budgetMs: 4_500 },
      { name: "grounding-check", budgetMs: 200 },
    ],
  },
  calls: { typical: 1, hardMax: 3 },
  dominantCost: "input",
  leversOn: [
    "search before prompting",
    "20 log lines max",
    "small model default",
    "breaker on the log backend",
    "per-investigation spend ceiling",
  ],
};

export const INVESTIGATOR_MAP: FailureRow[] = [
  {
    layer: "model",
    failure: "names a cause that appears nowhere in the retrieved context",
    likelihood: 4,
    blast: 4,
    blindness: 4,
    silent: true,
    signal: "ungrounded handover rate",
    mitigation: { class: "prevent", how: "grounding check against retrieved lines, downgrade to a dead end if it fails" },
  },
  {
    layer: "output",
    failure: "on-call stops checking the evidence and starts trusting the summary",
    likelihood: 3,
    blast: 4,
    blindness: 5,
    silent: true,
    signal: "share of handovers marked actionable, reviewed weekly",
    mitigation: { class: "prevent", how: "always render the quoted lines inline, never a bare cause" },
  },
  {
    layer: "context",
    failure: "the 20-line cap drops the one line that mattered",
    likelihood: 3,
    blast: 4,
    blindness: 4,
    silent: true,
    signal: "truncation counter, and errors dropped per investigation",
    mitigation: { class: "prevent", how: "rank by level and proximity to the alert before capping, never take the first 20" },
  },
  {
    layer: "retrieval",
    failure: "log ingest lags, so it reasons on data from before the deploy",
    likelihood: 3,
    blast: 3,
    blindness: 5,
    silent: true,
    signal: "ingest lag p95, stamped on every investigation",
    mitigation: { class: "detect", how: "refuse to answer when lag exceeds 60s and say why" },
  },
  {
    layer: "model",
    failure: "provider updates the model and answers quietly get worse",
    likelihood: 3,
    blast: 3,
    blindness: 5,
    silent: true,
    signal: "weekly replay of ten past incidents, scored",
    mitigation: { class: "detect", how: "pin the model id, replay the golden incidents on a schedule, alert on a score drop" },
  },
  {
    layer: "data-privacy",
    failure: "pulls another team's service logs into the prompt",
    likelihood: 2,
    blast: 4,
    blindness: 5,
    silent: true,
    signal: "services present in context versus the alert's service",
    mitigation: { class: "prevent", how: "scope every query to the alerting service and its declared dependencies" },
  },
  {
    layer: "tools",
    failure: "proposes a destructive next action against the wrong service",
    likelihood: 2,
    blast: 5,
    blindness: 3,
    silent: false,
    signal: "actions proposed versus actions taken",
    mitigation: { class: "prevent", how: "it proposes, a human executes, and it never holds a rollback credential" },
  },
  {
    layer: "agent-loop",
    failure: "keeps searching and asking while the outage runs",
    likelihood: 3,
    blast: 3,
    blindness: 2,
    silent: false,
    signal: "steps and spend per investigation",
    mitigation: { class: "prevent", how: "step cap of 3, spend ceiling, and a hard deadline of 10s" },
  },
  {
    layer: "cost-capacity",
    failure: "an alert storm fires forty investigations at once",
    likelihood: 3,
    blast: 3,
    blindness: 2,
    silent: false,
    signal: "investigations per alert group",
    mitigation: { class: "prevent", how: "dedupe by alert group and single-flight, one investigation per group" },
  },
  {
    layer: "retrieval",
    failure: "log backend is degraded because there is an incident",
    likelihood: 4,
    blast: 3,
    blindness: 1,
    silent: false,
    signal: "search failure rate, breaker state",
    mitigation: { class: "degrade", how: "breaker, then answer from the deploy list alone and label it degraded" },
  },
  {
    layer: "cost-capacity",
    failure: "it costs more than the time it saves",
    likelihood: 2,
    blast: 2,
    blindness: 4,
    silent: true,
    signal: "spend per investigation against time-to-mitigation",
    mitigation: { class: "detect", how: "track both monthly and kill the feature if the lines cross" },
  },
  {
    layer: "input",
    failure: "the alert payload is a wall of stack trace",
    likelihood: 3,
    blast: 2,
    blindness: 1,
    silent: false,
    mitigation: { class: "prevent", how: "truncate the payload at the edge before any token is billed" },
  },
];

/** The entry for the failure that costs the most and shows the least. */
export const UNGROUNDED_ENTRY: RunbookEntry = {
  failure: "the investigator is handing on causes it cannot cite",
  symptom: "ungrounded handover rate above 20 percent for an hour, with no errors and normal latency",
  checks: [
    "ingest lag: is it reasoning on data from before the deploy?",
    "the last ten handovers, are the discarded quotes near-misses or inventions?",
    "model id on recent investigations versus the pinned one",
  ],
  act: {
    mitigation: "set flag investigator.handover_requires_grounding=true so dead ends are returned instead of causes",
    confirmedBy: "ungrounded handover rate back under 5 percent on the next twenty investigations",
  },
  escalation: "set flag investigator.enabled=false and post in the on-call channel that the runbook is the source of truth today",
  prevent: "pin the model id in config, replay the ten golden incidents in CI, and alert on ingest lag above 60s",
  rehearsed: true,
};
