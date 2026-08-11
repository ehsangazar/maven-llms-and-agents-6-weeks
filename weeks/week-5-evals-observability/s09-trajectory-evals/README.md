# S9 · Trajectory evals, not just outputs

Part of [Week 5 · Evals and Observability](..). Three questions, one folder
each: **what** to grade, **who** grades it, and **when** the grade is allowed to
block a release. The hands-on build is
[Lab 5 · Eval Harness](../lab-eval-harness).

| Folder | The question | Runs offline |
|---|---|---|
| [`real-world`](real-world) | What do you assert about the path the agent took? | yes |
| [`judge`](judge) | Is the LLM grading your fuzzy cases any good? | the scorer, yes |
| [`suite`](suite) | Does this change ship? | yes |

Everything except `judge/index.ts` is pure and deterministic, so the whole
session runs with no API key:

```bash
npm test
npm run typecheck
```

## What to watch for

**`real-world/trajectory.ts`** · a right answer reached the wrong way. The
refund agent that issued first and checked policy afterwards prints the same
happy sentence as the one that did it properly. `gradeTrajectory` asserts three
clauses and no more: required steps in order, forbidden steps never, and a step
budget. Assert the whole recorded transcript instead and the suite goes red the
first time somebody adds a log line.

**`judge/agreement.ts`** · the trap in one number. A judge that agrees with your
humans 94% of the time on a set where 93% of cases pass has learned nothing;
"always say pass" scores 93. `scoreJudge` reports the lift over that baseline
and the false-pass rate, and refuses to call a judge trustworthy on either a
tiny slice or a generous one.

**`suite/suite.ts`** · why the pass rate lies. The test encodes a real-looking
release: 84% to 91%, and four cases that used to pass now fail. `gate` blocks
it. A single new failure beats any improvement in the average.

## The live judge demo (needs `OPENROUTER_API_KEY`)

```bash
npm run lab weeks/week-5-evals-observability/s09-trajectory-evals/judge/index.ts
npm run lab weeks/week-5-evals-observability/s09-trajectory-evals/real-world/index.ts
```

**Watch for:** the fluent invented-policy answer failing the grounding rubric
while reading better than the one that passes, then the judge's own scorecard
underneath it.
