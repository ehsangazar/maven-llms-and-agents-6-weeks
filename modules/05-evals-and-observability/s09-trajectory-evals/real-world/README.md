# S9 real-world · Grading the path, not just the answer

The S9 lesson on a real job: a refund agent can print the right final message for
the wrong reason, issuing the refund before it checked the policy and getting
lucky. A **trajectory check** asserts the required steps happened in the required
order, a property the final answer cannot reveal.

[`trajectory.ts`](trajectory.ts) is pure and deterministic, so it is testable
with **no API key**.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** the correct path passing, a missing `check_policy` failing, and
refund-before-policy failing as out of order even though both end the same way.

### The live demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab modules/05-evals-and-observability/s09-trajectory-evals/real-world/index.ts
```

**Watch for:** the rule-based trajectory grader and an LLM-as-judge grader run
side by side. Lab 5 builds the full harness with both grader types.
