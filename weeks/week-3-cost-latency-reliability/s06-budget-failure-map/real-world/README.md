# S6 real-world · When the incident tool becomes the incident

[S5](../../s05-cost-latency-reliability/real-world) built a production bug
investigator. This is its failure-mode map made executable, and it is a good
example precisely because the expensive failure is the quiet one:

- **Loud:** the log backend is down. Everyone can see it, the ladder handles it,
  and on-call knows they are working with less.
- **Silent:** the investigator names a plausible cause that nothing supports.
  Nothing throws, latency is fine, and on-call spends forty minutes on the wrong
  service while the real outage continues.

So the blast radius of an on-call assistant is measured in **minutes added to an
outage**, and the mitigation is not a better prompt. It is refusing to pass on a
cause whose evidence does not appear in the context you actually retrieved.

## What is here

| File | What it is |
|---|---|
| [`grounding.ts`](grounding.ts) | `checkGrounding` (does every quoted line exist in what you retrieved?), `handOver` (downgrade rather than forward), and `tally` for the metric this needs |
| [`resilient.ts`](resilient.ts) | the fallback ladder as a reusable combinator, recording which rungs failed |
| [`incident.ts`](incident.ts) | the same fixed outage S5 investigates |

`checkGrounding` is deliberately dumb: substring matching over what you
retrieved. A cleverer check would be another model call, which is another thing
that can be confidently wrong, and this is the layer meant to stop that.

### The spec is the test (offline, no key)

```bash
npm test
```

**Watch for:** a hypothesis that is *right* but half invented still failing the
check, a fabricated quote being caught however well it reads, and `handOver`
downgrading rather than dropping. "I looked at these three things and found
nothing" is a real contribution at 3am. A confident wrong answer is not.

### The demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/real-world/index.ts
```

Three runs: the full context, a starved context where the honest answer is "I do
not know", and a fabricated hypothesis to put the check itself on trial.

**Watch for:** what the model does with the starved context. If it names the
footer deploy, the grounding check just saved on-call forty minutes, and you have
watched the most valuable thing in this session happen live.

### Its own Project 2

[`../example/bug-investigator.ts`](../example/bug-investigator.ts) is the full
artifact for this system: a budget, twelve ranked failure rows and a runbook
entry, all passing the reviewers in this folder.

```bash
npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/review.ts --investigator
```

The top two rows are worth arguing with. Fabrication scores 64. "On-call stops
checking the evidence and starts trusting the summary" scores 60, and it is not
a software failure at all.
