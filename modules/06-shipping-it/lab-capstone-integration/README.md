# Capstone · Integrate & Defend

**module 6**

Combine Labs 1–5 into one system behind a single entry point, write the
seven-section system design document, run your eval harness against it, and
prepare a five-minute walkthrough you can defend to a staff panel.

## What you build
- One system, one entry point, wiring together: router (Lab 1), retrieval (Lab 2), budget/cache/fallback (Lab 3), guardrailed agent (Lab 4), eval harness (Lab 5)
- The seven-section design document (see template below)
- An eval run over the integrated system
- A five-minute design-review walkthrough

## The seven-section design document

Use `system-design-template.md` (added during the cohort) covering:

1. Problem & goals
2. Context & retrieval design
3. Cost & latency budget
4. Agent architecture + threat model
5. Eval & observability plan
6. Failure-mode runbook
7. Open questions & trade-offs

## Where to start
Shared LLM client: [`../../../common/llm.ts`](../../../common/llm.ts). Each prior
lab lives under its week in [`../../`](../../) (weeks 1 to 5).

> Session page:
> [hub.gazar.dev/llms-and-agents/lab-capstone-integration](https://hub.gazar.dev/llms-and-agents/lab-capstone-integration/)
