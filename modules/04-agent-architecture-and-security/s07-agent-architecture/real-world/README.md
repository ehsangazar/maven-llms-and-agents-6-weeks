# S7 real-world · A ReAct loop and its step-cap guardrail

The S7 lesson on a real job: an agent that answers a support question by looping
(pick an action, run a tool, observe, repeat) until it decides it is done. The
characteristic agent failure is not a crash, it is a **runaway** that never
finishes, so the loop carries a step cap that turns "bills forever" into "stops
and says so".

[`agent.ts`](agent.ts) is pure and deps-injected (the policy and tools are
parameters), so the loop and its cap are testable with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the observation being fed back into the policy, and the runaway
policy hitting the cap at exactly `maxSteps` instead of looping forever.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/04-agent-architecture-and-security/s07-agent-architecture/real-world/index.ts
```

**Watch for:** the model choosing to call `lookup_plan` before answering, and
the step count staying under the cap. Lab 4 hardens this loop with guardrails.
