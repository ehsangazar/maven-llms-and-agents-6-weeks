# S6 real-world · A fallback ladder you can reuse

The S6 workshop artifact: a small `withFallback` combinator that tries a
sequence of steps, catches whatever each one throws, and returns the first
success or a safe default. It records which failure modes fired, which is exactly
the failure-mode map the workshop asks you to draw.

[`resilient.ts`](resilient.ts) is pure and deps-injected, so every failure path
is testable with **no API key and no real timeouts**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the first success short-circuiting the rest, a failure falling
through to the next rung, and every-step-fails returning the safe default with
the full failure map intact.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/03-cost-latency-reliability/s06-budget-failure-map/real-world/index.ts
```

**Watch for:** the primary region forced to 503, the backup model answering, and
the failure map naming what broke on the way. Lab 3 turns this into the full
budget + cache + fallback ladder.
