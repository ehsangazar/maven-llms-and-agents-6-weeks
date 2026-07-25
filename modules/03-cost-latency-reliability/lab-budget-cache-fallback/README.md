# Lab 3 · Add a Budget, Cache & Fallback Ladder

**module 3 · Cost, latency & reliability**

Wrap a model call with a per-request cost/latency budget, a semantic cache, a
retry-and-fallback ladder, and an idempotency key so a retry can never
double-charge.

## What you build
- A budget wrapper that caps cost and latency per request
- A semantic cache (similar prompt → cached answer)
- A fallback ladder: cheap model → capable model → safe default
- An idempotency key that makes retries safe
- A resume: kill the run mid-way and restart it, and prove the already-done work
  is neither repeated nor re-billed (S7's durability rule, in code)

## Where to start
Shared LLM client: [`../../../common/llm.ts`](../../../common/llm.ts).

```
starter/    scaffolding + TODOs
solution/   the worked reference
```

> Worked reference is filled in during the cohort. Session page:
> [hub.gazar.dev/llms-and-agents/lab-budget-cache-fallback](https://hub.gazar.dev/llms-and-agents/lab-budget-cache-fallback/)
