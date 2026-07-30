/**
 * S6 · run the workshop's own rubric over an artifact.
 *
 * This is the self-check slide as a command. It needs no API key: everything it
 * inspects is data you wrote, not a model you called.
 *
 * Run it:  npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts
 *
 * Point it at your own Project 2 by importing yours instead of the example.
 */

import { reviewBudget } from "./budget/budget.ts";
import { rank, reviewMap, score, silentShare } from "./failure-map/map.ts";
import { uncoveredLayers } from "./failure-map/taxonomy.ts";
import { lintEntry } from "./runbook/runbook.ts";
import { BUDGET, FAILURE_MAP, LATENCY_ENTRY, RETRIEVAL_ENTRY } from "./example/support-assistant.ts";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function heading(text: string): void {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

function report(label: string, violations: string[], warnings: string[]): void {
  if (violations.length === 0) console.log(`  ${label}: passes`);
  for (const v of violations) console.log(`  FAIL  ${v}`);
  for (const w of warnings) console.log(`  warn  ${w}`);
}

heading(`Budget: ${BUDGET.request}`);
const budgetReview = reviewBudget(BUDGET);
console.log(
  `  ceiling ${BUDGET.latency.ceilingMs.value}ms = ${budgetReview.workMs}ms of work + ${budgetReview.headroomMs}ms headroom`,
);
console.log(
  `  cost $${BUDGET.cost.typical.value} typical, $${BUDGET.cost.worst.value} worst, ${BUDGET.calls.hardMax} calls max`,
);
report("budget", budgetReview.violations, budgetReview.warnings);

heading(`Failure map: ${FAILURE_MAP.length} rows, ${pct(silentShare(FAILURE_MAP))} of them silent`);
for (const row of rank(FAILURE_MAP).slice(0, 5)) {
  const flags = [row.silent ? "silent" : "loud", row.mitigation.class].join(", ");
  console.log(`  ${String(score(row)).padStart(3)}  ${row.failure}  (${flags})`);
}
const missing = uncoveredLayers(FAILURE_MAP.map((r) => r.layer));
if (missing.length > 0) console.log(`  layers not covered: ${missing.join(", ")}`);
const mapReview = reviewMap(FAILURE_MAP);
report("map", mapReview.violations, mapReview.warnings);

heading("Runbook entries");
for (const entry of [LATENCY_ENTRY, RETRIEVAL_ENTRY]) {
  const smells = lintEntry(entry);
  console.log(`  ${entry.failure}`);
  report("    entry", smells.map((s) => s.message), []);
}

const failed = budgetReview.violations.length + mapReview.violations.length;
heading(failed === 0 ? "Ready to submit" : `${failed} thing(s) to fix before submitting`);
