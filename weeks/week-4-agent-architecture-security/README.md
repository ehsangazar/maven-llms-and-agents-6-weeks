# Week 4 · Agent architecture & security

Tool use, planning loops, memory and durability, each mapped to how it breaks.
Then the attack surface an agent opens the moment it can act.

| # | Folder | What it is |
|---|--------|-----------|
| S7 | [`s07-agent-architecture`](s07-agent-architecture) | The loop and its four stops, tools as contracts, planning, durability, single vs multi-agent |
| S8 | [`s08-securing-agents`](s08-securing-agents) | Prompt injection, tool poisoning, least-privilege tooling, output guardrails |
| Lab 4 | [`lab-guardrailed-agent`](lab-guardrailed-agent) | ReAct agent, step cap, approval gate before writes, refuses an injected document |

**S7 is fully worked and runs offline.** Five folders, one per decision the
session makes: `tools/` (the contract), `loop/` (the four stops), `planning/`
(react vs plan-then-execute vs reflect, plus the compounding math), `durability/`
(checkpoint, resume, what may be replayed) and `multi-agent/` (when a split is
real, and what coordination costs). Plus `real-world/`, an order support agent
whose refund tool refuses the model, and `decide.ts`, which prints the four
decisions for your own system.

```bash
npx vitest run weeks/week-4-agent-architecture-security
npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/decide.ts
```

If you only have time for one lab in the course, make it Lab 4. The guardrails
are the part people skip and then need at 2am.
