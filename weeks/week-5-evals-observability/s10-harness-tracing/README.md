# S10 · Workshop: harness, tracing & runbook

Part of [Week 5 · Evals and Observability](..). S9 decided *what* to grade.
This is the machine that records it, watches it, versions it, and knows when to
put a person in the way.

| Folder | What it is |
|--------|-----------|
| [`tracing`](tracing) | The span recorder, the replay test as a function, and the redaction seam |
| [`dashboards`](dashboards) | Cost, latency and quality from a window of traces, plus the alert lines |
| [`versioning`](versioning) | Content-hashed prompt ids, and the promotion gate |
| [`hitl`](hitl) | Routing to a human on stakes then confidence, and corrections becoming cases |
| [`real-world`](real-world) | The smallest honest eval harness: golden set in, pass rate out |

### The whole thing in one run, no API key

```bash
npm run lab weeks/week-5-evals-observability/s10-harness-tracing/demo.ts
```

**Watch for:** the mean reporting **1432 ms** while the p95 is **9000 ms** and
pages someone. That gap is the session.

### The spec is the test

```bash
npm test
```

**Watch for:** four things that only a test can show you honestly. A failing span
is still recorded before the error rethrows. `replayGaps` names every field a
debugger would otherwise have to ask you for. Averaging two shard p95s gives
**4550** where the truth is **200**. And an irreversible tool goes to review at
0.99 confidence, because confidence is not authority.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-5-evals-observability/s10-harness-tracing/real-world/index.ts
```

**Watch for:** the pass rate and per-case trace over a real classifier. Lab 5
adds the second grader type, the trajectory check, and regression detection.
