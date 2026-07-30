/**
 * S5 · the latency model: a ceiling is not one number.
 *
 * "p95 under 2 seconds" tells no individual hop what to do. You split the
 * ceiling across the hops, keep headroom back for the fallback ladder, and give
 * every hop a deadline so a slow one gets cut instead of waited on.
 *
 * Also here: the arithmetic nobody does. Percentiles do not add. Five hops that
 * are each "fast 95 percent of the time" are a chain that misses its budget
 * nearly a quarter of the time.
 *
 * The clock is injected, so none of this needs real time to test.
 */

export interface Hop {
  name: string;
  budgetMs: number;
}

export interface DeadlinePlan {
  ceilingMs: number;
  hops: Hop[];
  /** Fraction of the ceiling held back for retries, a cheaper model, or a cached answer. */
  headroomFraction: number;
}

export interface PlanReport {
  workMs: number;
  headroomMs: number;
  spareMs: number;
  violations: string[];
}

/**
 * Check a split against its ceiling. `spareMs` is what is left after the hops
 * and the reserved headroom, so a healthy plan has it at or above zero.
 */
export function reviewPlan(plan: DeadlinePlan): PlanReport {
  const workMs = plan.hops.reduce((sum, h) => sum + h.budgetMs, 0);
  const headroomMs = plan.ceilingMs * plan.headroomFraction;
  const spareMs = plan.ceilingMs - workMs - headroomMs;
  const violations: string[] = [];

  if (plan.headroomFraction < 0.15) {
    violations.push(
      "headroom below 15 percent: spend the whole ceiling on the happy path and a slow request becomes a failed one",
    );
  }
  if (spareMs < 0) {
    violations.push(
      `hops total ${workMs}ms plus ${Math.round(headroomMs)}ms headroom, which exceeds the ${plan.ceilingMs}ms ceiling`,
    );
  }
  for (const hop of plan.hops) {
    if (hop.budgetMs <= 0) violations.push(`hop "${hop.name}" has no deadline of its own`);
  }

  return { workMs, headroomMs, spareMs, violations };
}

/**
 * The chance a sequential chain stays inside its budget, given each hop is fast
 * `perHopP` of the time. Every hop you add makes the tail worse faster than it
 * makes the mean worse.
 */
export function chainSuccessProbability(perHopP: number, hops: number): number {
  if (perHopP < 0 || perHopP > 1) throw new Error("chainSuccessProbability: perHopP must be 0..1");
  return perHopP ** hops;
}

export type Clock = () => number;

/**
 * One deadline for the whole request, shared by every hop. What the SDK cannot
 * know is your request's deadline, and that is the part you must own.
 */
export class Deadline {
  private readonly startedAt: number;

  constructor(
    private readonly totalMs: number,
    private readonly now: Clock = Date.now,
  ) {
    this.startedAt = now();
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }

  expired(): boolean {
    return this.remainingMs() <= 0;
  }

  /**
   * What this hop actually gets: its own budget, capped by whatever is left.
   * An earlier hop overrunning shrinks the later ones rather than the ceiling.
   */
  allow(hopBudgetMs: number): number {
    return Math.min(hopBudgetMs, this.remainingMs());
  }

  /**
   * Is there time to try something that typically takes `costMs`? Use this
   * before a retry: a retry you have no time to finish is pure waste.
   */
  affords(costMs: number): boolean {
    return this.remainingMs() >= costMs;
  }
}

/** Reject if `fn` has not settled within `ms`. The abort signal lets the work stop too. */
export async function withDeadline<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
