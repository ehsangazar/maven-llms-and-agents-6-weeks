# S3 real-world · Fitting a support answer in the window

The S3 lesson made concrete: you have more candidate context than fits, so you
rank by relevance and pack greedily under a budget. Cramming everything in is
not free, it costs more and buries the one line that matters.

The selector ([`context.ts`](context.ts)) is pure and deterministic, so the
packing rules are testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the highest-scoring pieces going in first, the budget never
exceeded, and a too-big top piece getting dropped while a smaller one still
fits.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/02-context-and-retrieval/s03-context-engineering/real-world/index.ts
```

**Watch for:** the onboarding tips and VPN guide dropped, the billing policy and
invoice kept, and a correct answer built from only what made the cut.
