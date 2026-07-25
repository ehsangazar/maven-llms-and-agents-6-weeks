# S10 real-world · The smallest honest eval harness

The S10 workshop artifact: a golden set, a system under test, a grader, and a
pass-rate report that keeps each trace and survives an empty run without dividing
by zero. That is the observability half of the session in the fewest moving parts
that still earns the name.

[`harness.ts`](harness.ts) is pure and deps-injected, so it is testable with
**no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** a full-pass run reporting 1.0 with traces kept, a partial run
computing the right rate, and an empty suite returning 0 rather than `NaN`.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/05-evals-and-observability/s10-harness-tracing/real-world/index.ts
```

**Watch for:** the pass rate and per-case trace over a real classifier. Lab 5
adds the second grader type, the trajectory check, and regression detection.
