# S7 real-world · the agent that refuses the refund it was asked for

The S7 session on a real job: a customer writes in about an order, and the agent
looks it up, reads the policy, and either refunds it or explains why it cannot.

It is the right job for this session because every architecture choice is
visible in it, and each one is testable:

| Choice | Where it lives |
|---|---|
| Narrow tools, typed arguments | `createSupportRegistry` in [`support.ts`](support.ts) |
| The rule enforced server-side | the GBP cap re-checked inside `issue_refund`, not in the prompt |
| Effects declared | `lookup_order` is `read`, `issue_refund` is `irreversible` |
| Retry safety | the `refunded` map: the same order refunded twice returns the first receipt |
| A bounded run | `handleTicket` passes a step cap and a budget to `runAgent` |

### The spec is the test (offline, no key)

```bash
npx vitest run weeks/week-4-agent-architecture-security/s07-agent-architecture
```

**Watch for** the test named *"refuses an over-limit refund in the TOOL,
whatever the model asked for"*. The scripted policy does everything right,
politely, and still asks for a GBP 950 refund. Nothing in the prompt stops it.
The tool does.

Then *"recovers when the model invents a tool that does not exist"*: a
hallucinated `run_sql` costs one step and a readable error, not the run.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/real-world/index.ts
```

Two tickets go through, one inside the policy and one outside it. **Watch for**
the model looking the order up before answering, the refusal arriving as an
observation that the model then has to explain to the customer, and the run
stopping on its own with a `stopReason` you can read.

### Where it goes next

[Lab 4 · Guardrailed Agent](../../lab-guardrailed-agent) takes this same loop and
adds the security layer: an approval gate before writes, and a retrieved
document that tries to talk the agent into a refund it should refuse.
