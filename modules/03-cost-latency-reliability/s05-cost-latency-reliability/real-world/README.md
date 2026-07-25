# S5 real-world · Moderation on a budget that fails closed

The S5 lesson on a real job: moderate messages with a cheap classifier first and
a stronger one only when needed, under a hard per-request budget. When the budget
cannot cover the next rung, you stop and **fail closed** (block), because for
moderation the safe default is not "let it through".

[`moderate.ts`](moderate.ts) is pure and deps-injected, so the budget and
fail-closed rules are testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the cheap tier stopping early when confident, escalation when it
is unsure, and a budget too small to escalate producing a `block` from the
safe default, having paid only for the rung it actually reached.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/03-cost-latency-reliability/s05-cost-latency-reliability/real-world/index.ts
```

**Watch for:** the tier and dollar cost printed per message. This is Lab 3's
budget argument, on live traffic.
