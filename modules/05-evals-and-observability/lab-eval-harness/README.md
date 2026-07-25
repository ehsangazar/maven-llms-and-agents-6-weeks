# Lab 5 · Build an Eval Harness

**module 5 · Evals & observability**

A golden set, a runner, rule + LLM-judge graders, a trajectory check, and a
pass-rate report that catches a regression you deliberately introduce.

## What you build
- A golden set of eval cases (input + expectations), including a safety/injection case
- A runner that executes each case against your system
- Two grader types: rule-based checks and an LLM-as-judge
- A trajectory check (did it call the right tools, in order?)
- A pass-rate report that fails when you plant a regression

## Where to start
The generate → grade → refine loop this builds on is demonstrated in
[`week-1 · s1 · patterns/05-evaluator-optimizer.ts`](../../week-1-foundations/s1-why-demos-die/patterns/05-evaluator-optimizer.ts).
Shared LLM client: [`../../../common/llm.ts`](../../../common/llm.ts).

```
starter/    scaffolding + TODOs
solution/   the worked reference
```

> Worked reference is filled in during the cohort. Session page:
> [hub.gazar.dev/llms-and-agents/lab-eval-harness](https://hub.gazar.dev/llms-and-agents/lab-eval-harness/)
