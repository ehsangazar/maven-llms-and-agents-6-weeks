# S2 · The deterministic/model boundary

Runnable companion for Session 2. Same idea as [S1](../s1-why-demos-die): a
read-along you run while we talk. This one is about the line between code you
control and a model that decides, and *when you even need an agent* at all.

Everything routes through [`common/llm.ts`](../../../common/llm.ts).

**Before you start:** if you have not already, `npm install`, then
`cp .env.example .env` and add your `OPENROUTER_API_KEY`. Both scripts call a real
model. See S1's [Troubleshooting](../s1-why-demos-die#troubleshooting) if a
command dies on a missing key or a 429.

## Workflow vs agent, same task (`workflow-vs-agent/`)

One job, done two ways. Run both, back to back, the comparison is the point.

### `as-workflow.ts`, fixed sequence

```bash
npm run lab modules/01-workflows-and-agents/s02-code-model-boundary/workflow-vs-agent/as-workflow.ts
```

**Watch for:** the call count. You decided the steps at design time, so the
calls are predictable and so is the cost.

### `as-agent.ts`, a loop that decides when it is done

```bash
npm run lab modules/01-workflows-and-agents/s02-code-model-boundary/workflow-vs-agent/as-agent.ts
```

**Watch for:** the call count again, and compare. Same job, more calls, and it
occasionally wanders. The model, not you, is deciding when to stop.

The agent doing in 5 calls what the workflow did in 2 is why the rule is
*start with a workflow, and only cross into an agent when the task genuinely
needs the model to choose its own steps*. That boundary is the whole session.

## Next

The week's hands-on lab is [Lab 1 · Build a Workflow Router](../lab-workflow-router).
It hardens S1's routing pattern into a real, tested router, start with
`npm test`, which needs no API key.
