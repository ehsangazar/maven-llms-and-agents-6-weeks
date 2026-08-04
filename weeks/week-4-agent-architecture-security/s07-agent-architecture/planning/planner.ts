/**
 * S7 · how the agent decides what to do next, and what that choice costs.
 *
 * "Planning" sounds like one thing. It is really three, and they fail
 * differently:
 *
 *   react              think, act, look, repeat. Handles surprises. Wanders.
 *   plan_then_execute  write all the steps first, then run them. Cheap and
 *                      predictable. Blind to anything the plan did not expect.
 *   reflect            do it, criticise it, do it again. Buys quality. Doubles
 *                      or triples the bill for the same task.
 *
 * And there is a fourth answer that beginners are taught to be embarrassed
 * about, which is usually the right one: `none`, a plain scripted workflow.
 *
 * The arithmetic below is the reason any of this matters. Steps multiply, they
 * do not add, so a loop of "pretty reliable" steps is not a reliable loop.
 */

export type PlannerKind = "none" | "react" | "plan_then_execute" | "reflect";

export interface PlannerProfile {
  kind: PlannerKind;
  /** Roughly how many model calls, per unit of work. */
  callsPerTask: string;
  goodFor: string;
  breaksAs: string;
  guardrail: string;
}

export const PLANNERS: readonly PlannerProfile[] = [
  {
    kind: "none",
    callsPerTask: "1 per fuzzy step you actually need",
    goodFor: "the path is known and stable: classify, then retrieve, then answer",
    breaksAs: "it cannot handle a case nobody wrote a branch for",
    guardrail: "an explicit fallback branch, and a metric for how often it fires",
  },
  {
    kind: "react",
    callsPerTask: "1 per step, and the step count is not known up front",
    goodFor: "open-ended work, multi-hop lookups, recovering from a surprise",
    breaksAs: "wandering, and error compounding as each step trusts the last",
    guardrail: "step cap, budget, repeat detection, validation between steps",
  },
  {
    kind: "plan_then_execute",
    callsPerTask: "1 to plan, then 1 per step",
    goodFor: "work with a shape you can predict, where you want the plan reviewed",
    breaksAs: "the plan was written before the first observation, so it goes stale",
    guardrail: "validate each step's result, and allow a bounded number of replans",
  },
  {
    kind: "reflect",
    callsPerTask: "2 to 3 per step (do, critique, redo)",
    goodFor: "one high-value output where quality beats cost: a report, a migration",
    breaksAs: "polishing forever, and a critic that agrees with itself",
    guardrail: "a hard round cap, and a critic with a rubric rather than a vibe",
  },
] as const;

export interface TaskShape {
  /** Do you know the steps before you start? */
  pathKnown: boolean;
  /** Does the next step depend on what the last one returned? */
  stepsDependOnResults: boolean;
  /** Is a single, high-quality artifact the deliverable? */
  qualityOverCost: boolean;
}

export interface PlannerChoice {
  kind: PlannerKind;
  because: string;
}

/**
 * The decision, as a function rather than a feeling. Note the order: the
 * cheapest answer is checked first, and "none" wins ties.
 */
export function choosePlanner(shape: TaskShape): PlannerChoice {
  if (shape.pathKnown && !shape.stepsDependOnResults) {
    return { kind: "none", because: "the path is known, so a workflow is cheaper and testable" };
  }
  if (shape.qualityOverCost && !shape.stepsDependOnResults) {
    return { kind: "reflect", because: "one artifact where quality is worth extra calls" };
  }
  if (shape.pathKnown) {
    return {
      kind: "plan_then_execute",
      because: "the shape is predictable, so plan once and validate each step",
    };
  }
  return { kind: "react", because: "the next step is only knowable after the last observation" };
}

/**
 * The compounding law. If each step is right 95 percent of the time, a ten step
 * run is right about 60 percent of the time, and nothing threw an exception on
 * the way. This is the single most useful number in agent design.
 */
export function chainSuccess(perStep: number, steps: number): number {
  if (perStep < 0 || perStep > 1) throw new Error("chainSuccess: perStep must be between 0 and 1");
  if (steps < 0) throw new Error("chainSuccess: steps must not be negative");
  return perStep ** steps;
}

/** How many steps you can chain before you fall under a target success rate. */
export function maxStepsFor(perStep: number, target: number): number {
  if (perStep >= 1) return Infinity;
  if (perStep <= 0) return 0;
  let steps = 0;
  while (chainSuccess(perStep, steps + 1) >= target) steps++;
  return steps;
}

/**
 * The other half of the same law: a check between steps stops errors from
 * compounding, because a caught step is retried instead of built upon.
 * `catchRate` is the share of bad steps your validation actually catches.
 */
export function chainSuccessWithChecks(
  perStep: number,
  steps: number,
  catchRate: number,
): number {
  const effective = perStep + (1 - perStep) * catchRate;
  return chainSuccess(Math.min(effective, 1), steps);
}

export interface PlanStepResult {
  step: string;
  output: string;
  valid: boolean;
}

export interface PlanRun {
  results: PlanStepResult[];
  replans: number;
  completed: boolean;
}

/**
 * Plan-then-execute, with the part people leave out: a validated step, and a
 * bounded chance to rewrite the rest of the plan when reality disagrees.
 *
 * Without `validate`, this is just a for-loop that trusts a model's guesses in
 * order, which is exactly how a plan goes stale at step two and wastes steps
 * three through nine.
 */
export async function runPlan(
  plan: string[],
  execute: (step: string, previous: PlanStepResult[]) => Promise<string>,
  options: {
    validate?: (result: { step: string; output: string }) => boolean;
    replan?: (failed: string, done: PlanStepResult[]) => Promise<string[]>;
    maxReplans?: number;
  } = {},
): Promise<PlanRun> {
  const validate = options.validate ?? (() => true);
  const maxReplans = options.maxReplans ?? 1;

  const results: PlanStepResult[] = [];
  let remaining = [...plan];
  let replans = 0;

  while (remaining.length > 0) {
    const step = remaining.shift() as string;
    const output = await execute(step, results);
    const valid = validate({ step, output });
    results.push({ step, output, valid });

    if (valid) continue;

    // The step failed its check. Building the next six steps on top of it is
    // the compounding failure, so either replan or stop honestly.
    if (options.replan && replans < maxReplans) {
      replans++;
      remaining = await options.replan(step, results);
      continue;
    }
    return { results, replans, completed: false };
  }

  return { results, replans, completed: true };
}
