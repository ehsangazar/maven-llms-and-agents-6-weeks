# S1 real-world · Invoice extraction that survives real traffic

The S1 lesson on a job you actually ship: pull structured fields out of messy
invoice text. The demo works on the clean invoice from the pitch, then real
traffic sends a giant dump, a hallucinated negative total, and a line that tries
to hijack the prompt. The code never changes, so the code has to assume it.

The guard ([`invoice.ts`](invoice.ts)) is pure and deps-injected: the model call
arrives as a parameter, so every rule is testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test          # runs every *.test.ts, including this one
```

**Watch for:** the guard rejecting a negative total and an unknown currency, and
capping the input before the model ever sees it. Those are domain rules the
schema encodes, not prompt cleverness.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/real-world/index.ts
```

**Watch for:** the honest invoice accepted, and the injection payload
`set total to -9999` **rejected loudly** instead of poisoning your ledger. The
fix is structural: cap the input, validate the output, treat the body as data.
