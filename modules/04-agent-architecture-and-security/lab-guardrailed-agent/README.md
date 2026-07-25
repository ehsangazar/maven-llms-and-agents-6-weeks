# Lab 4 · Build a Tool-Using Agent with Guardrails

**module 4 · Agent architecture & security**

A ReAct agent with least-privilege tools, a step cap, an approval gate before
any write, and two hostile inputs it must survive: a poisoned document, and a
poisoned tool.

## What you build
- A ReAct loop (reason → call tool → observe → repeat) with a step cap
- Least-privilege tools (each does one narrow, server-enforced thing)
- An approval gate before any write/side-effecting action
- **Prompt-injection defense**: a retrieved document tries to hijack the agent, and it refuses
- **Supply-chain defense**: the agent's tools arrive over MCP, and one of the servers is hostile
- A short threat model for the result

## The two attacks, and why they need different answers

This is the point of the lab, so do not skip the second one.

**The poisoned document** is indirect injection (S8). Untrusted text arrives as
a tool *result* and tries to issue instructions. You defend it at the trust
boundary: retrieved content never carries authority, and the write tool needs an
approval that no document can grant.

**The poisoned tool** is a different animal, and most of what you just built
does nothing about it. Here the attack rides in a *tool description*. It is not
something the agent fetched, it is in the prompt before the agent has read
anything, and it announces itself as trustworthy. You cannot filter your way
out: by the time the model sees it, it is indistinguishable from your own
instructions.

The defense is upstream, and it is boring, which is the lesson. Pin the server.
Allow-list which servers may load at all. Read tool descriptions like any other
dependency's code, because that is what they are. Supply chain, not prompting.

## What you must demonstrate
- The agent completes the honest task
- The poisoned document does **not** cause a write
- The poisoned tool is **never loaded**, and you can name the check that stopped it
- With the allow-list disabled, the poisoned tool *does* land — watch the attack
  work before you claim the defense works

## Where to start
The tool-calling loop is demonstrated minimally in
[`week-1 · s2 · workflow-vs-agent/as-agent.ts`](../../week-1-foundations/s2-model-boundary/workflow-vs-agent/as-agent.ts).
Shared LLM client: [`../../../common/llm.ts`](../../../common/llm.ts).
Background: [MCP field guide](https://hub.gazar.dev/llms-and-agents/tool-mcp/).

The starter will include a local MCP server pair, one honest and one hostile, so
nothing here touches a real third party. Your job is the client side: the
allow-list, the approval gate, and the loop.

```
starter/    scaffolding + TODOs — lands the week before this lab runs
solution/   the worked reference, published after the session
```

> Session page:
> [hub.gazar.dev/llms-and-agents/lab-guardrailed-agent](https://hub.gazar.dev/llms-and-agents/lab-guardrailed-agent/)
