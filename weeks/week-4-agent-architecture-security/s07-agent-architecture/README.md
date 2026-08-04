# S7 · Agent architecture and its failure modes

Part of [Week 4 · Agent Architecture and Security](..). The session slides are at
[hub.gazar.dev/llms-and-agents/s07-agent-architecture](https://hub.gazar.dev/llms-and-agents/s07-agent-architecture/);
this folder is the runnable version of every mechanism on them.

Everything here is pure and dependency-injected. The model arrives as a
function (`Policy`), the tools arrive as a registry, the clock never matters. So
the whole folder runs and is tested with **no API key**, which is the argument
being made rather than a shortcut: if you cannot test your agent's stop
conditions without calling a model, the seam is in the wrong place.

```bash
npm test                                                 # all of it, offline
npx vitest run weeks/week-4-agent-architecture-security   # just this week
npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/decide.ts
```

## What is in here

Four folders, matching the four decisions the slides walk through.

### `tools/` · a tool is a contract, so make the contract a type

| File | What it gives you |
|---|---|
| [`tool.ts`](tools/tool.ts) | `defineTool` (name rules, a required description, a zod argument schema, a declared `effect`) and `createRegistry`, which is the allow-list: an unknown tool, bad arguments and a thrown tool all come back as an **observation**, never an exception |

Three claims to check in [`tool.test.ts`](tools/tool.test.ts): the caller's
identity comes from code and never from the model's arguments, a huge result is
truncated and admits it, and the catalogue is sorted so your cached prompt
prefix survives someone adding a tool.

### `loop/` · the agent loop, and the four things that stop it

| File | What it gives you |
|---|---|
| [`agent.ts`](loop/agent.ts) | `runAgent`: policy, tools, history, and **four independent stops**, `done`, `step_cap`, `budget`, `no_progress` |

`no_progress` is the one people leave out. A model calling the same tool with
the same arguments three times is not working, it is spinning, and it bills like
working. The budget is checked *before* the next call, because a budget checked
afterwards is a receipt.

Independent calls in one step run through `Promise.all`, so the test asserting
three tools in flight at once is a latency lesson rather than a detail.

### `planning/` · how it decides the next step, and what that costs

| File | What it gives you |
|---|---|
| [`planner.ts`](planning/planner.ts) | `PLANNERS` (none, react, plan-then-execute, reflect, each with its failure mode and guardrail), `choosePlanner`, the compounding math `chainSuccess` / `maxStepsFor` / `chainSuccessWithChecks`, and `runPlan` with validation and bounded replanning |

The compounding math is the most useful number in the session: 95 percent per
step is 60 percent per run over ten steps, with nothing thrown and nothing
logged. `chainSuccessWithChecks` prices the fix.

### `durability/` · the run that dies at step 30

| File | What it gives you |
|---|---|
| [`checkpoint.ts`](durability/checkpoint.ts) | `runDurable` (checkpoint after every step, resume from the record, never redo a completed step), pause and resume via `approve`, and `replayRule` / `unsafeToReplay` |

Read the test called *"without a store, a resume would re-fire every side
effect"* first. It is four lines, and it is the incident: the customer's second
refund, issued by a retry.

### `multi-agent/` · one agent, until one agent is not enough

| File | What it gives you |
|---|---|
| [`orchestrator.ts`](multi-agent/orchestrator.ts) | `shouldSplit` (a chain is not parallelism, and same-context subtasks are not a split), `runOrchestrator` with an isolated history per worker and a **divided** budget, and `coordinationShare`, the tax as a number |

A failed worker comes back marked `trusted: false` and named in `excluded`
rather than quietly missing from the merge. That is error propagation, caught.

### `real-world/` · the whole thing on one job

[An order support agent that refuses the refund it was asked for](real-world/README.md).
Three tools, a server-side refund cap, an idempotent refund, a step cap and a
budget.

The demonstration is the second ticket: the model politely asks to refund a
GBP 950 order, and the **tool** says no. The prompt never gets a vote.

### `decide.ts` · your own system, in four decisions

Edit the `SYSTEM` object and run it. It prints your planner and its failure
mode, how many steps your per-step reliability affords, which of your steps must
never be replayed, and whether you have a real reason to split. Every line is a
sentence you can defend in Project 3.

## Where this goes next

[S8](../s08-securing-agents) attacks exactly this architecture, and
[Lab 4 · Guardrailed Agent](../lab-guardrailed-agent) hardens the loop in
`loop/agent.ts` with approval gates and injection defence. The pause and resume
in `durability/checkpoint.ts` is the mechanism that approval gate is built on.
