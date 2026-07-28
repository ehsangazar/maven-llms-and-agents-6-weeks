# S4 real-world · A context pipeline: dedup + freshness

The S4 workshop artifact in code: the pipeline you wrap around a retriever so it
does not hand the model near-duplicate snippets or a stale doc that outranks a
fresh one. Dedup, decay relevance by age, then pack under a budget.

[`pipeline.ts`](pipeline.ts) is pure and deterministic (age is passed in, not
read from the clock), so it is testable with **no API key**. Lab 2 builds the
real retriever that feeds it.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the stale duplicate collapsing into the fresh one, a fresher doc
overtaking a higher raw-relevance stale doc, and the budget respected.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-2-context-retrieval/s04-context-pipeline/real-world/index.ts
```

**Watch for:** `policy-v1` (a 400-day-old duplicate) and the 2019 promo getting
dropped, so the model answers from current policy only.
