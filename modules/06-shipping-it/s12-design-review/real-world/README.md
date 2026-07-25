# S12 real-world · From eval numbers to a ship / hold verdict

The S12 wrap-up in code: fold each section's eval pass rate into one scorecard
with a single verdict. One rule does not bend, a safety failure forces **hold**
no matter how green everything else is. A 99% pass rate with an open injection
hole is not a ship.

[`scorecard.ts`](scorecard.ts) is pure and deterministic, so the verdict logic
is testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** a below-threshold section forcing a hold, and a safety failure
forcing a hold even at a perfect pass rate.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/06-shipping-it/s12-design-review/real-world/index.ts
```

**Watch for:** the verdict decided by code, with the model only narrating the
review opener. The injection blocker holds the ship even though four sections are
green.
