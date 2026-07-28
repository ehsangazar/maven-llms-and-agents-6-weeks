# S2 real-world · Bug-report intake as a workflow

The S2 lesson on a real job: turn a messy bug report into a structured ticket.
Built as a **workflow**, the steps are fixed (summarize, then classify, then
assemble), so it costs exactly two model calls every single run. That predictable
cost is the deterministic side of the boundary.

Compare it with the agent doing a nearly identical job in
[`../workflow-vs-agent/as-agent.ts`](../workflow-vs-agent/as-agent.ts): same
goal, but the model decides the steps, so the call count wanders.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the assertion that the run always costs two calls, and that the
severity the classifier returns is validated before it reaches the ticket.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-1-foundations/s02-code-model-boundary/real-world/index.ts
```

**Watch for:** the printed call count. It is two, and it stays two, because you
own the control flow. Reach for an agent only when the task genuinely needs to
choose its own steps.
