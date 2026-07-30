# Week 3 · Cost, latency & reliability

Per-request ceilings you can defend, the levers that hold them, and what happens
when a call fails anyway.

| # | Folder | What it is |
|---|--------|-----------|
| S5 | [`s05-cost-latency-reliability`](s05-cost-latency-reliability) | Budgets, routing, caching, and designing for non-determinism |
| S6 | [`s06-budget-failure-map`](s06-budget-failure-map) | Putting numbers on it: the budget and the failure-mode map |
| Lab 3 | [`lab-budget-cache-fallback`](lab-budget-cache-fallback) | Budget, semantic cache, fallback ladder, idempotency key |

Both session folders are fully worked and run offline:

```bash
npx vitest run weeks/week-3-cost-latency-reliability
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts
```

S5 is the mechanisms: cost arithmetic, the deadline split, prefix and answer
caching, routing, batching, retries with jitter, a circuit breaker, and
idempotent effects. S6 is the artifacts: the budget, the failure-mode map and the
runbook entry, each as typed data with a linter, so Project 2's rubric is
something you run rather than something you remember.

The idempotency key is the part people leave out. A retry that double-charges is
a reliability feature that became an incident.
