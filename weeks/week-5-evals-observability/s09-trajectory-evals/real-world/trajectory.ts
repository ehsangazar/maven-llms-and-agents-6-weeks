/**
 * S9 real-world example, grading the path and not just the answer.
 *
 * A refund agent can produce the right final message for the wrong reason: it
 * issued the refund BEFORE checking the policy, and got lucky. A trajectory
 * check asserts the required steps happened in the required order, which is a
 * property the final answer cannot show you.
 *
 * Pure and deterministic: no model, no key.
 */
export interface TrajectoryResult {
  pass: boolean;
  missing: string[];
  outOfOrder: boolean;
}

/**
 * Check that every `expected` step appears in `trace`, in the given relative
 * order. Missing steps fail. Present-but-reordered steps fail as out of order.
 */
export function checkOrder(trace: string[], expected: string[]): TrajectoryResult {
  const missing = expected.filter((step) => !trace.includes(step));
  if (missing.length) return { pass: false, missing, outOfOrder: false };

  const positions = expected.map((step) => trace.indexOf(step));
  let outOfOrder = false;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! <= positions[i - 1]!) outOfOrder = true;
  }
  return { pass: !outOfOrder, missing: [], outOfOrder };
}

/**
 * What a trajectory assertion is allowed to say. Three clauses, no more.
 *
 * The temptation is to assert the whole recorded transcript, because you have
 * it. Do that and the suite goes red the first time somebody adds a harmless
 * logging call, so the team stops trusting it and then stops running it.
 */
export interface TrajectorySpec {
  /** Steps that MUST appear, in this relative order. Nothing else is asserted. */
  required: string[];
  /** Steps that must NEVER appear. This is where S8's red-team cases land. */
  forbidden?: string[];
  /** A cap on total steps. A correct answer reached in 30 calls is a regression. */
  maxSteps?: number;
}

export interface TrajectoryGrade extends TrajectoryResult {
  forbidden: string[];
  overBudget: boolean;
}

/**
 * Grade a trace against a spec. Fails on a missing step, a reordered step, a
 * forbidden step, or a path that went over budget.
 */
export function gradeTrajectory(trace: string[], spec: TrajectorySpec): TrajectoryGrade {
  const order = checkOrder(trace, spec.required);

  // The safety half. "issue_refund must never appear without check_policy" is a
  // rule; a prompt asking nicely for it is not.
  const forbidden = (spec.forbidden ?? []).filter((step) => trace.includes(step));

  // Efficiency is part of correct. Without this line, a looping agent passes.
  const overBudget = spec.maxSteps !== undefined && trace.length > spec.maxSteps;

  return {
    pass: order.pass && forbidden.length === 0 && !overBudget,
    missing: order.missing,
    outOfOrder: order.outOfOrder,
    forbidden,
    overBudget,
  };
}
