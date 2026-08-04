# Week 4 · Agent architecture & security

Tool use, planning loops, memory and durability, each mapped to how it breaks.
Then the attack surface an agent opens the moment it can act.

| # | Folder | What it is |
|---|--------|-----------|
| S7 | [`s07-agent-architecture`](s07-agent-architecture) | The loop and its four stops, tools as contracts, planning, durability, single vs multi-agent |
| S8 | [`s08-securing-agents`](s08-securing-agents) | The trust boundary, capabilities and taint, approval gates, egress, supply chain, red-team suite |
| Lab 4 | [`lab-guardrailed-agent`](lab-guardrailed-agent) | ReAct agent, step cap, approval gate before writes, refuses an injected document |

**Both session folders are fully worked and run offline.** 126 tests, no API key.

```bash
npx vitest run weeks/week-4-agent-architecture-security
npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/decide.ts
npm run lab weeks/week-4-agent-architecture-security/s08-securing-agents/threat-model.ts
```

S7 is one folder per decision the agent makes: `tools/` (the contract), `loop/`
(the four stops), `planning/` (react vs plan-then-execute vs reflect, plus the
compounding math), `durability/` (checkpoint, resume, what may be replayed) and
`multi-agent/` (when a split is real, and what coordination costs).

S8 attacks it, and is one folder per defensive layer: `boundary/` (untrusted as
a type), `privilege/` (capabilities, scope, and taint), `approval/` (a yes bound
to exact arguments), `egress/` (where bytes may go) and `supply-chain/` (the
tools you did not write), plus `redteam/`, nine payloads that run against the
real hardened path on every commit.

The two folders share code on purpose: S8's `real-world/hardened.ts` wraps S7's
agent without changing a line of it. Security is added around the tools, not
inside them.

If you only have time for one lab in the course, make it Lab 4. The guardrails
are the part people skip and then need at 2am.
