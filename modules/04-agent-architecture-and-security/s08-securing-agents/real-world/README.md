# S8 real-world · Two guards for two different attacks

The S8 lesson in code. A poisoned **document** tries to make the agent issue a
refund; the defense is that retrieved content carries no authority and any write
needs an approval no document can grant. A poisoned **tool** rides in from a
rogue server; the defense is upstream, an allow-list of which servers may load
at all.

All three guards in [`guards.ts`](guards.ts) are pure functions, so they are
testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the rogue server blocked, the write refused without approval, and
approval for one action not carrying over to another.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/04-agent-architecture-and-security/s08-securing-agents/real-world/index.ts
```

**Watch for:** even if the model proposes the injected refund, the approval gate
refuses it, and the `evil.example` tool never loads. The defense is the gate and
the allow-list, not the model's judgement. Lab 4 builds the full guardrailed
agent around these.
