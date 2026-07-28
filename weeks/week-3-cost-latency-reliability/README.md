# Week 3 · Cost, latency & reliability

Per-request ceilings you can defend, the levers that hold them, and what happens
when a call fails anyway.

| # | Folder | What it is |
|---|--------|-----------|
| S5 | [`s05-cost-latency-reliability`](s05-cost-latency-reliability) | Budgets, routing, caching, and designing for non-determinism |
| S6 | [`s06-budget-failure-map`](s06-budget-failure-map) | Putting numbers on it: the budget and the failure-mode map |
| Lab 3 | [`lab-budget-cache-fallback`](lab-budget-cache-fallback) | Budget, semantic cache, fallback ladder, idempotency key |

The idempotency key is the part people leave out. A retry that double-charges is
a reliability feature that became an incident.
