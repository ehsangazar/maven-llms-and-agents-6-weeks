# S5 real-world · A production bug investigator that survives the incident

An on-call assistant. Given an alert, it correlates recent deploys, pulls the log
lines that matter, and proposes a cause **with evidence**. It is the right job
for this session because it fails in all four ways at once:

| | Why this job breaks it |
|---|---|
| **Cost** | Logs are enormous. The naive version pastes them all in and hopes. The search is the lever, not the model. |
| **Latency** | A page is firing. An answer at 40 seconds is not an answer. |
| **Failure** | The log backend is degraded *because* there is an incident. The dependency you need is the one that is down. |
| **Blindness** | A confidently wrong cause sends on-call down a 40-minute hole, during an outage. Refusing is cheaper than guessing. |

[`investigate.ts`](investigate.ts) wires up this session's own modules rather
than reimplementing them: the [`Deadline`](../latency/deadline.ts) and the
[`CircuitBreaker`](../reliability/breaker.ts). Everything else is injected, so
every path above is testable with **no API key and no real timeouts**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the log backend failing and the investigation continuing on
deploys alone; the breaker stopping the second search instead of queueing on a
corpse; the step cap, the spend ceiling and the deadline each halting the loop
and saying which one bit; and `investigate` returning **no answer at all** when
the model produces a confident cause it cannot cite.

That last one is the whole design. During an incident, "here is what I checked
and I do not know" beats a plausible cause that costs someone 40 minutes.

### The replay (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-3-cost-latency-reliability/s05-cost-latency-reliability/real-world/index.ts
```

Same alert, three runs: naive, guarded, and guarded with the log backend down.

A representative run: naive sends ~17,500 tokens for **$0.057** in 3.9s; guarded
sends 20 ranked lines for **$0.007** in 1.8s and reaches the same conclusion.
Roughly eight times cheaper and twice as fast, and that is on a thirty-second
window of one service. A real investigation spans minutes and a dozen services.

**Watch for:** the third run. It may still answer, citing a real deploy, and
still be wrong. Grounded is necessary, not sufficient, which is why on-call is
told the run was degraded, and why [S6](../../s06-budget-failure-map/real-world)
scores that failure highest.

### The incident

[`incident.ts`](incident.ts) is a fixed, reproducible outage: `checkout-api v482`
ships at 14:02 and turns one cart lookup into one query per line item, and the
20-connection pool is exhausted by 14:06.

Eighteen log lines explain it. They sit in a window of **1,218**, alongside
ordinary traffic about footers, thumbnails and digests. That ratio is the honest
part, and it is why `searchLogs` ranks errors and warnings above info before it
truncates: the difference between twenty useful lines and twenty lines about
thumbnails is the whole job.

`TRUE_CAUSE` is exported so the demo can grade the answer. Your real investigator
does not get one, which is rather the point.

### Where this goes next

[S6](../../s06-budget-failure-map) maps how this investigator itself breaks and
what you would do about it at 3am. [Lab 3](../../lab-budget-cache-fallback) turns
the guards into a reusable request path.
