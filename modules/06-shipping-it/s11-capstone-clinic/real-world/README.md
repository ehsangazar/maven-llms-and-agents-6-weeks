# S11 real-world · A mini copilot that wires the course together

The S11 design-clinic artifact: one entry point that classifies a request and
only reaches for retrieval when the question needs docs. Small talk skips it; a
docs question with no relevant context refuses instead of guessing. This is the
integration shape you defend before building the full capstone.

[`copilot.ts`](copilot.ts) is pure and deps-injected, so the wiring (which
component runs, in what order) is testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** small talk skipping retrieval entirely, the full path running for
a docs question with context, and a refusal when nothing relevant comes back.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/06-shipping-it/s11-capstone-clinic/real-world/index.ts
```

**Watch for:** the `used: [...]` trace per request. It is the integration story
in one line. Lab 6 (the capstone) grows this into the full defended system.
