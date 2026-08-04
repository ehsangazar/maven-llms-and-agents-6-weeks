/**
 * S7 · one agent, until one agent is not enough.
 *
 * Multi-agent gets sold as an org chart: a manager, some specialists, a nice
 * diagram. The honest reason to split is duller and much more useful:
 *
 *   CONTEXT ISOLATION. Each worker gets its own clean history, so one
 *   subtask's forty lines of tool output never pollute another's window.
 *
 * Everything else it "buys" (parallelism, separation of concerns) you can often
 * get from one agent with better tools. And splitting is not free. You pay:
 *
 *   - a coordination call to split the work, and another to merge it,
 *   - a budget that now has to be divided rather than shared, and
 *   - error propagation: worker A's confident guess becomes worker B's fact.
 *
 * This file makes those three costs measurable instead of arguable.
 */

export interface Subtask {
  id: string;
  goal: string;
  /** Ids of subtasks whose results this one needs. Any entry means "not parallel". */
  dependsOn?: string[];
}

export interface SplitShape {
  subtasks: Subtask[];
  /** Would each subtask need a large, different set of context? */
  contextDiffers: boolean;
}

export interface SplitDecision {
  split: boolean;
  because: string;
}

/**
 * The decision, written down. Note that "there are several subtasks" is not on
 * its own a reason: a single agent does several subtasks all day.
 */
export function shouldSplit(shape: SplitShape): SplitDecision {
  const { subtasks, contextDiffers } = shape;

  if (subtasks.length < 2) {
    return { split: false, because: "one subtask is one agent" };
  }
  const independent = subtasks.filter((t) => (t.dependsOn ?? []).length === 0);
  if (independent.length < 2) {
    return {
      split: false,
      because: "the subtasks are a chain, so splitting adds handoffs without adding parallelism",
    };
  }
  if (!contextDiffers) {
    return {
      split: false,
      because: "same context for every subtask, so one agent with good tools is cheaper",
    };
  }
  return {
    split: true,
    because: `${independent.length} independent subtasks that each need their own context`,
  };
}

export interface WorkerResult {
  id: string;
  output: string;
  /** False when the worker failed or ran out of budget. Never silently dropped. */
  trusted: boolean;
  costUsd: number;
  note?: string;
}

export interface OrchestratorResult {
  results: WorkerResult[];
  /** The merged answer, built only from trusted results. */
  merged: string;
  /** What the split itself cost, before any real work happened. */
  coordinationUsd: number;
  totalUsd: number;
  /** Results that failed and were excluded, named rather than hidden. */
  excluded: string[];
}

export interface OrchestratorOptions {
  /** Total spend allowed for the whole job, workers and coordination together. */
  budgetUsd: number;
  /** The split call plus the merge call. Real, and usually forgotten. */
  coordinationUsd?: number;
}

export type Worker = (subtask: Subtask, isolatedHistory: string[]) => Promise<{
  output: string;
  costUsd: number;
}>;

/**
 * Fan out to workers, then merge. Each worker gets a FRESH history containing
 * only its own goal, which is the point of the pattern.
 */
export async function runOrchestrator(
  subtasks: Subtask[],
  worker: Worker,
  merge: (trusted: WorkerResult[]) => string,
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const coordinationUsd = options.coordinationUsd ?? 0;
  const workerBudget = options.budgetUsd - coordinationUsd;

  if (workerBudget <= 0) {
    throw new Error(
      "runOrchestrator: coordination alone exceeds the budget. " +
        "That is the whole finding, and the answer is one agent.",
    );
  }

  // Divide, do not share. A shared pot means the first worker can spend it all.
  const perWorker = workerBudget / subtasks.length;

  const results = await Promise.all(
    subtasks.map(async (subtask): Promise<WorkerResult> => {
      // A fresh window per worker. It cannot see any other worker's history.
      const isolatedHistory = [`goal: ${subtask.goal}`];
      try {
        const { output, costUsd } = await worker(subtask, isolatedHistory);
        if (costUsd > perWorker) {
          return {
            id: subtask.id,
            output,
            trusted: false,
            costUsd,
            note: `over its $${perWorker.toFixed(3)} share`,
          };
        }
        return { id: subtask.id, output, trusted: true, costUsd };
      } catch (err) {
        return {
          id: subtask.id,
          output: "",
          trusted: false,
          costUsd: 0,
          note: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const trusted = results.filter((r) => r.trusted);
  const excluded = results.filter((r) => !r.trusted).map((r) => r.id);
  const totalUsd = coordinationUsd + results.reduce((sum, r) => sum + r.costUsd, 0);

  return {
    results,
    merged: merge(trusted),
    coordinationUsd,
    totalUsd,
    excluded,
  };
}

/**
 * The tax, as a number. How much of this job's spend went on splitting and
 * merging rather than on the work itself?
 */
export function coordinationShare(result: OrchestratorResult): number {
  if (result.totalUsd === 0) return 0;
  return result.coordinationUsd / result.totalUsd;
}
