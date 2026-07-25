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
