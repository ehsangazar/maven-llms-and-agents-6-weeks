# S5 · Budgets, routing, and designing for failure

Part of [Week 3 · Cost, Latency and Reliability](..). The session slides are at
[hub.gazar.dev/llms-and-agents/s05-cost-latency-reliability](https://hub.gazar.dev/llms-and-agents/s05-cost-latency-reliability/);
this folder is the runnable version of every mechanism on them.

Everything here is pure and dependency-injected: clocks, timers, randomness and
model calls all arrive as arguments. So the whole folder is testable with **no
API key and no waiting**, which is the point being made rather than a shortcut.

```bash
npm test                                              # all of it, offline
npx vitest run weeks/week-3-cost-latency-reliability  # just this week
```

## What is in here

### `cost/` · the arithmetic that picks your lever

| File | What it gives you |
|---|---|
| [`price.ts`](cost/price.ts) | `costOfCall` (input, output, and the cached-prefix rate), `expectedCost` / `worstCaseCost` over a request plan, `unboundedAmplifiers`, and `revenueShare` / `ceilingForShare` |

The claim to check: input dominates, most of it is context you assembled rather
than typed, and a request is not a call. `unboundedAmplifiers` returning a name
is a missing loop limit, not a rounding error.

### `latency/` · a ceiling is not one number

| File | What it gives you |
|---|---|
| [`deadline.ts`](latency/deadline.ts) | `reviewPlan` for a deadline split with headroom, `chainSuccessProbability` for why percentiles do not add, a `Deadline` you pass down the call stack, and `withDeadline` |

`Deadline.allow(hopBudget)` is the interesting one: an earlier hop overrunning
shrinks the later hops rather than the ceiling.

### `levers/` · the ones you can implement in an afternoon

| File | What it gives you |
|---|---|
| [`cache.ts`](levers/cache.ts) | `orderForPrefixCache` and `sharedPrefixLength` (the vendor cache is a prefix match, so ordering is the whole game), plus `AnswerCache` with TTL, entry age and hit-rate reporting |
| [`router.ts`](levers/router.ts) | rules first and the model as the fallback, escalation on low confidence, per-tier output caps, and `servedByMix` so silent degradation is visible |
| [`batcher.ts`](levers/batcher.ts) | a micro-batcher that flushes on size **or** time, whichever comes first |

`answerCacheKey` throws without a tenant id on purpose. A cache key missing its
tenant is the cross-tenant leak from the S6 failure map, and it returns 200 OK.

### `reliability/` · for the failure that happens anyway

| File | What it gives you |
|---|---|
| [`retry.ts`](reliability/retry.ts) | classification by status rather than by message text, full-jitter backoff, and a retry that refuses to start what the deadline cannot finish |
| [`breaker.ts`](reliability/breaker.ts) | a circuit breaker with closed, open and half-open, where a failed probe reopens it immediately |
| [`idempotency.ts`](reliability/idempotency.ts) | an idempotency key derived from intent, and a `once` that also collapses concurrent retries |

Read `idempotency.test.ts` before you write your own. The test named "changes on
every attempt if you key on the attempt" is the bug this exists to prevent, and
it is a quiet one.

### `real-world/` · the whole thing on one job

[Moderation on a budget that fails closed](real-world/README.md): a cheap
classifier, escalation only when it is unsure, and a hard per-request budget that
blocks rather than allows when it runs out.

## Where this goes next

[Lab 3 · Budget, Cache & Fallback](../lab-budget-cache-fallback) assembles these
into one request path. [S6](../s06-budget-failure-map) turns the numbers into the
budget and failure-mode map you submit as Project 2.
