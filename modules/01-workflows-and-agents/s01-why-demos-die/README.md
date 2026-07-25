# S1 · Why demos die in production

Runnable companions for Session 1. Nothing here is graded, these are
read-along scripts you run while we talk, so the failure modes and the five
patterns are concrete instead of slideware.

Everything routes through [`common/llm.ts`](../../../common/llm.ts), so each file
is short. Run them in the order below; each one prints its own output and needs
nothing from the one before it.

> The other half of this week's story, *when you even need an agent*, is
> [S2 · The deterministic/model boundary](../s2-model-boundary), which you run
> right after these.

**Before you start:** `npm install`, then `cp .env.example .env` and add your
`OPENROUTER_API_KEY`. Every command on this page calls a real model and costs real
money. If a command dies on a missing key or a 429, see
[Troubleshooting](#troubleshooting).

## 1. The demo that dies (`hook/`)

Same task, parse a support ticket into structured fields, three ways.
Run them in this order; the story only lands if you see them in sequence.

### `hook/naive.ts`, the demo

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/hook/naive.ts
```

Looks great on the one input from the pitch. **Watch for:** clean parsed
output, and note we never validated it. Nothing here tells you it is fragile.

### `hook/real-traffic.ts`, the same code, real traffic

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/hook/real-traffic.ts
```

**Watch for:** three failures firing in a row, malformed output, a huge input
that blows latency and cost, and a prompt-injection payload. The code did not
change. The inputs did.

> This is the most expensive script on the page: it deliberately sends a large
> input to make the cost spike visible. Run it once.

### `hook/hardened.ts`, the fix

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/hook/hardened.ts
```

**Watch for:** the same bad inputs now failing *loudly and safely*. The fix is
structural (schema validation), not a cleverer prompt.

The three failures here are the whole course in miniature: validation (module 1),
cost ceilings (module 3), injection defense (module 4).

## 2. The five workflow patterns (`patterns/`)

One minimal file each, the canonical patterns from Anthropic's
*Building Effective Agents*. Start with these before you reach for an agent.
Run them in any order; each stands alone.

### Prompt chaining, decompose into steps, gate between them

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/01-prompt-chaining.ts
```

**Watch for:** the gate between steps. A step that fails its check stops the
chain instead of feeding garbage forward.

### Routing, classify, then dispatch to a specialist

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/02-routing.ts
```

**Watch for:** the classify-then-dispatch split. This is the pattern Lab 1
hardens into a real router, so read this one closely.

### Parallelization, fan out, then aggregate (voting)

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/03-parallelization.ts
```

**Watch for:** independent calls voting on one answer. Cost scales with the
fan-out; reliability is what you buy with it.

### Orchestrator-workers, dynamically split a task, then synthesize

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/04-orchestrator-workers.ts
```

**Watch for:** the model deciding the subtasks at runtime, not you at design
time. That flexibility is exactly what makes the cost unpredictable.

### Evaluator-optimizer, generate, grade, refine until it passes

```bash
npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/05-evaluator-optimizer.ts
```

**Watch for:** the loop count. Every refinement round is another bill, which is
why the exit condition matters more than the prompt.

## Next

Continue to [S2 · The deterministic/model boundary](../s2-model-boundary), which
puts these same patterns to the test: workflow vs agent on one task. Then the
week's hands-on lab is [Lab 1 · Build a Workflow Router](../lab-workflow-router),
which starts with `npm test` and needs no API key.

## Troubleshooting

**`Error: The apiKey option is missing` (or a 401 on the first call)**
You have no `.env`, or it has no key in it. Run `cp .env.example .env` and add
your key. The `npm run lab` command loads `.env` for you; running `tsx` directly
does not.

**`RateLimitError: 429 You exceeded your current quota`**
Your key works but the account behind it has no credit. Check your
[OpenRouter credits](https://openrouter.ai/credits).
This is not a code problem.

**Nothing runs and you have no key.** You can still do Lab 1 in full: its tests
are the brief, need no API key, and make no network calls.
