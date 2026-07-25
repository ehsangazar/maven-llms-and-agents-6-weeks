# Lab 1 · Build a Workflow Router

**module 1 · Foundations**

Classify each incoming request and route it to the cheapest handler that can do
the job — a rules handler, a small model, or a big model — with schema
validation on the way out and a fallback when a route fails. Then report your
cost split across the three tiers.

## What you build
- A classifier that labels each request
- Three handlers (rules / small model / large model)
- Validated output (the request can't leave without matching a schema)
- A fallback path when the chosen route fails
- A cost report: how much traffic each tier absorbed

## Where to start

1. Read [`router.test.ts`](router.test.ts). **It is the brief.** Every rule this
   router must follow is written there as a failing test.
2. Fill in the four TODOs in [`starter/router.ts`](starter/router.ts):
   `chooseTier`, `validateReply`, `runRouter`, and `Ledger.report`.
3. `npm test` until it is green. No API key needed.

   ```bash
   npm test          # runs the spec against starter/. All 17 fail on a fresh clone.
   ```

4. Then run it against a real model and print the bill. This one needs
   `OPENROUTER_API_KEY` in `.env`:

   ```bash
   npm run lab modules/01-workflows-and-agents/lab-workflow-router/starter/index.ts
   ```

The worked reference lives in [`solution/`](solution/). The same spec grades it:

```bash
npm run test:solution   # same 17 tests, graded against solution/
npm run lab modules/01-workflows-and-agents/lab-workflow-router/solution/index.ts
```

The routing pattern this lab hardens is demonstrated minimally in
[`../s1-why-demos-die/patterns/02-routing.ts`](../s1-why-demos-die/patterns/02-routing.ts).
The shared LLM client is [`../../../common/llm.ts`](../../../common/llm.ts).

## The two things people get wrong

- **An unconfident answer is a failure, not a result.** Nothing threw, so it
  ships. The ladder has to treat `confident: false` exactly like a crash.
- **A failed rung still costs money.** You paid the small model before you fell
  off it and paid the large one. The report bills every attempt, not every
  answer, because that is what the invoice does.

```
starter/    the lab: stubs + TODOs
solution/   the worked reference, published after the session
```

> Session page:
> [hub.gazar.dev/llms-and-agents/lab-workflow-router](https://hub.gazar.dev/llms-and-agents/lab-workflow-router/)
