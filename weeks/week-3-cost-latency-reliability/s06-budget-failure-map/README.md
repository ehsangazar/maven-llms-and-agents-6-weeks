# S6 · Workshop: budget + failure-mode map

Part of [Week 3 · Cost, Latency and Reliability](..). The workshop slides are at
[hub.gazar.dev/llms-and-agents/s06-budget-failure-map](https://hub.gazar.dev/llms-and-agents/s06-budget-failure-map/).

The workshop produces three artifacts: a budget, a ranked failure-mode map, and
one runbook entry. This folder makes all three **typed data with a linter**, so
the rubric you are marked against is something you can run rather than something
you hope you remembered.

```bash
# lint the worked example, then swap in your own
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts
npm test    # the rules themselves, offline
```

## What is in here

| Folder | What it gives you |
|---|---|
| [`budget/`](budget/budget.ts) | `RequestBudget` as a type, and `reviewBudget`: real numbers, a bounded worst case, a deadline split with headroom, and every guess carrying a date to replace it |
| [`failure-map/`](failure-map/map.ts) | `score` = likelihood x blast x blindness, `rank`, and `reviewMap`, which enforces the rubric: a blast-5 row must be prevented, a high-scoring row must have a signal, and a map with almost no silent failures is a map of your web server |
| [`failure-map/taxonomy.ts`](failure-map/taxonomy.ts) | the nine layers as data, with `uncoveredLayers` to name the rows you have not written yet |
| [`runbook/`](runbook/runbook.ts) | `RunbookEntry`, and `lintEntry` for the six smells: vague verb, needs the author, no confirmation, diagnosis before mitigation, unbounded checks, never rehearsed |
| [`example/`](example/support-assistant.ts) | **two** full worked Project 2s: the support assistant, and the [production bug investigator](example/bug-investigator.ts) from S5 |
| [`real-world/`](real-world/README.md) | when the incident tool becomes the incident: a grounding check that refuses to pass on a cause it cannot cite, plus the fallback ladder it runs on |

Both examples pass every check in this folder, which is deliberate: a reference
artifact that fails its own rubric is not a reference.

```bash
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts --investigator
```

The investigator is the more interesting of the two, because the blast radius of
an on-call assistant is measured in minutes added to an outage. Its top-ranked
failure is fabrication (64), and second is "on-call stops checking the evidence
and starts trusting the summary" (60), which is not a software failure at all.

## How to use it on your own Project 2

1. Copy [`example/support-assistant.ts`](example/support-assistant.ts) and replace
   the contents with your system.
2. Import yours in [`review.ts`](review.ts) instead of the example.
3. Run it. Fix what it names. The warnings are judgement calls, the failures are not.
4. Hand the runbook entry to someone who did not build the system. That last test
   is the one no linter can do for you.

## Where the numbers come from

The example's arithmetic traces back to
[S5's `cost/price.ts`](../s05-cost-latency-reliability/cost/price.ts): 7,200
input tokens and 350 output at the large tier is about $0.027 a call, and 130
questions a month against a $20 seat puts a 10 percent revenue target at roughly
one and a half cents. Change the inputs there and the ceiling here moves with them.
