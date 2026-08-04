# Production-Ready Systems with LLMs and Agents, labs

Companion code for the course at
**[hub.gazar.dev/llms-and-agents](https://hub.gazar.dev/llms-and-agents/)**.

> **These are reference implementations of *patterns*, not a prescribed stack.**
> The course teaches architecture decisions that hold regardless of language or
> vendor. This repo happens to use TypeScript + OpenRouter so the patterns are
> runnable and concrete. Everything that touches a vendor lives behind one file
> (`common/llm.ts`); swap it and the labs still teach the same thing.

## How this repo is organised

**One folder per week, one folder per session**, named with the same slugs the
course uses. A session at `hub.gazar.dev/llms-and-agents/s01-why-demos-die` has
its code at `weeks/week-1-foundations/s01-why-demos-die`, so you never have to
translate between the syllabus and the repo.

```
common/llm.ts     the only vendor seam
weeks/
  week-1-foundations/
    s01-why-demos-die/          runnable companions to the session
    s02-code-model-boundary/
    lab-workflow-router/        the lab: starter/ + solution/ + tests
  week-2-context-retrieval/
    s03-context-engineering/
    s04-context-pipeline/
    lab-hybrid-rag/
  ...
```

Each week's own README lists its sessions, its lab and what to run first.

## Setup

```bash
npm install
cp .env.example .env    # add your OPENROUTER_API_KEY
```

## Running a lesson companion or a lab

Both run the same way:

```bash
npm run lab weeks/week-1-foundations/lab-workflow-router/starter/index.ts
```

### The tests are the brief

```bash
npm test
```

**These fail on a fresh clone. That is the point.** A lab's test file is its
spec: it describes exactly what your implementation must do, and you are done
when it is green. Read the test before you write any code.

The tests need no API key and make no network calls. Every lab injects its model
access, so the parts worth testing (which route was taken, what happens when a
tier fails, what it cost) are deterministic. If you cannot test your routing
without calling a model, the seam is in the wrong place. That is a lesson, not a
limitation.

## The six weeks

| Week | Sessions | The lab |
|------|----------|---------|
| 1 · [Foundations](weeks/week-1-foundations) | [`s01-why-demos-die`](weeks/week-1-foundations/s01-why-demos-die) · [`s02-code-model-boundary`](weeks/week-1-foundations/s02-code-model-boundary) | [`lab-workflow-router`](weeks/week-1-foundations/lab-workflow-router): classify a request and dispatch to the right handler, with schema-validated output |
| 2 · [Context engineering and retrieval](weeks/week-2-context-retrieval) | [`s03-context-engineering`](weeks/week-2-context-retrieval/s03-context-engineering) · [`s04-context-pipeline`](weeks/week-2-context-retrieval/s04-context-pipeline) | [`lab-hybrid-rag`](weeks/week-2-context-retrieval/lab-hybrid-rag): keyword plus vector, re-ranking, chunking |
| 3 · [Cost, latency and reliability](weeks/week-3-cost-latency-reliability) | [`s05-cost-latency-reliability`](weeks/week-3-cost-latency-reliability/s05-cost-latency-reliability) · [`s06-budget-failure-map`](weeks/week-3-cost-latency-reliability/s06-budget-failure-map) | [`lab-budget-cache-fallback`](weeks/week-3-cost-latency-reliability/lab-budget-cache-fallback): per-request budgets, caching, fallback ladders |
| 4 · [Agent architecture and security](weeks/week-4-agent-architecture-security) | [`s07-agent-architecture`](weeks/week-4-agent-architecture-security/s07-agent-architecture) (the loop, tools, planning, durability, multi-agent, all runnable) · [`s08-securing-agents`](weeks/week-4-agent-architecture-security/s08-securing-agents) | [`lab-guardrailed-agent`](weeks/week-4-agent-architecture-security/lab-guardrailed-agent): a guardrailed ReAct agent with tool-approval gates and injection defence |
| 5 · [Evals and observability](weeks/week-5-evals-observability) | [`s09-trajectory-evals`](weeks/week-5-evals-observability/s09-trajectory-evals) · [`s10-harness-tracing`](weeks/week-5-evals-observability/s10-harness-tracing) | [`lab-eval-harness`](weeks/week-5-evals-observability/lab-eval-harness): a trajectory-based eval harness with regression detection |
| 6 · [Shipping it](weeks/week-6-capstone) | [`s11-capstone-clinic`](weeks/week-6-capstone/s11-capstone-clinic) · [`s12-design-review`](weeks/week-6-capstone/s12-design-review) | [`lab-capstone-integration`](weeks/week-6-capstone/lab-capstone-integration): integrate labs 1 to 5 behind one entry point, plus the seven-section design document |

Doing this in four weeks instead? The same code, regrouped into the four-week
schedule, is at
[`maven-llms-and-agents-4-weeks`](https://github.com/ehsangazar/maven-llms-and-agents-4-weeks).

## What is scaffolded today

**Week 1 is complete.** Both lesson companions are fully worked and runnable,
and `lab-workflow-router` ships a starter, a worked solution and its full test
suite. It is the reference for how a lab looks in code.

**Week 3 is complete.** `s05-cost-latency-reliability` is the mechanisms
(cost arithmetic, the deadline split, prefix and answer caching, routing,
batching, retries with jitter, a circuit breaker, idempotent effects) and
`s06-budget-failure-map` is the artifacts (the budget, the failure-mode map and
the runbook entry, each as typed data with a linter, plus a fully worked example
that passes its own rubric). All of it runs offline.

**S7 is complete.** `s07-agent-architecture` is the agent itself, one folder per
decision: `tools/` (a tool as a typed contract, with a registry that turns every
failure into an observation), `loop/` (the loop and its four stops: done, step
cap, budget, no progress), `planning/` (react vs plan-then-execute vs reflect,
and the compounding math that decides how long a run may be), `durability/`
(checkpoint, resume, pause for a human, and what is safe to replay) and
`multi-agent/` (when a split is real, and the coordination tax as a number).
Plus a worked order support agent and `decide.ts`, which prints the four
decisions for your own system. All of it runs offline.

**Labs 2 to 6 are specified, not scaffolded.** Each has a README describing what
you build, and the corresponding course lesson carries the steps, the acceptance
criteria and the code shape. Build them in your own codebase against that spec,
or wait for the starter to land here.

The session companions for weeks 2, 5 and 6, and S8 in week 4, hold notes and
small runnable snippets rather than complete worked examples.

The course copy says exactly this, and the two are kept in step. If that stops
being true, the course is the thing to fix.
