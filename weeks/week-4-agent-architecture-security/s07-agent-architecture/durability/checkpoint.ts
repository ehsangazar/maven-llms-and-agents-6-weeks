/**
 * S7 · the run that dies at step 30.
 *
 * A forty step agent run outlives your deploy window. It will be interrupted:
 * a timeout, a rate limit, a crash, a Tuesday release. If the only copy of
 * "what has happened so far" is a local variable, then the run is exactly as
 * durable as the process, and an interruption means:
 *
 *   - you pay for the first thirty steps twice, and
 *   - every side effect from those steps fires again, so the customer gets a
 *     second email and possibly a second refund.
 *
 * The fix is boring and it is three things:
 *
 *   1. Save the state after every step, outside the process.
 *   2. On restart, skip the steps already recorded.
 *   3. Know which steps are safe to replay (see `replayRule`).
 *
 * The same machinery gives you pause and resume for free, which is how an
 * agent waits for a human without holding a process open. Session 8 uses that
 * to gate dangerous tools; here it is just architecture.
 */
import type { Effect } from "../tools/tool.ts";

export type RunStatus = "running" | "awaiting_approval" | "done" | "failed";

export interface CompletedStep {
  name: string;
  output: string;
  effect: Effect;
}

export interface RunRecord {
  runId: string;
  status: RunStatus;
  /** Append-only. Its length IS the resume point. */
  completed: CompletedStep[];
  approvedSteps: string[];
  pending?: { name: string; effect: Effect };
  answer?: string;
  lastError?: string;
}

export interface RunStore {
  load(runId: string): Promise<RunRecord | undefined>;
  save(record: RunRecord): Promise<void>;
}

/** In memory so the tests need no database. Use a real one in anger. */
export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, string>();
  /** How many times a checkpoint was written. Handy in tests and in a trace. */
  public saves = 0;

  async load(runId: string): Promise<RunRecord | undefined> {
    const raw = this.runs.get(runId);
    return raw ? (JSON.parse(raw) as RunRecord) : undefined;
  }

  async save(record: RunRecord): Promise<void> {
    this.saves++;
    // Serialised on the way in, so a test cannot accidentally share an object
    // with the store. A real store gives you this for free.
    this.runs.set(record.runId, JSON.stringify(record));
  }
}

export interface StepDef {
  name: string;
  effect: Effect;
}

export interface DurableOptions {
  /** Steps that must wait for a human before they run. */
  requireApproval?: (step: StepDef) => boolean;
}

/**
 * Run a list of steps so that an interruption costs you one step, not the run.
 *
 * Call it again with the same `runId` and the same store to resume. Steps
 * already in `completed` are never performed again.
 */
export async function runDurable(
  runId: string,
  steps: StepDef[],
  store: RunStore,
  perform: (step: StepDef, done: CompletedStep[]) => Promise<string>,
  options: DurableOptions = {},
): Promise<RunRecord> {
  const record: RunRecord = (await store.load(runId)) ?? {
    runId,
    status: "running",
    completed: [],
    approvedSteps: [],
  };

  record.status = "running";
  delete record.pending;

  for (let i = record.completed.length; i < steps.length; i++) {
    const step = steps[i];
    if (!step) break;

    const needsApproval = options.requireApproval?.(step) ?? false;
    if (needsApproval && !record.approvedSteps.includes(step.name)) {
      // Stop cleanly and persist WHY. Nothing is holding a socket open, and the
      // run can be picked up by a different process tomorrow.
      record.status = "awaiting_approval";
      record.pending = { name: step.name, effect: step.effect };
      await store.save(record);
      return record;
    }

    let output: string;
    try {
      output = await perform(step, record.completed);
    } catch (err) {
      // The state up to the previous step is already durable. Record why we
      // stopped and rethrow: a crash here loses one step, not thirty.
      record.status = "failed";
      record.lastError = err instanceof Error ? err.message : String(err);
      await store.save(record);
      throw err;
    }

    record.completed.push({ name: step.name, output, effect: step.effect });
    // The checkpoint is AFTER the step, every step. Batching these saves is how
    // people accidentally reintroduce the problem they were solving.
    await store.save(record);
  }

  record.status = "done";
  record.answer = record.completed.at(-1)?.output;
  await store.save(record);
  return record;
}

/** Record a human decision, then call `runDurable` again to continue. */
export async function approve(runId: string, stepName: string, store: RunStore): Promise<RunRecord> {
  const record = await store.load(runId);
  if (!record) throw new Error(`approve: no run ${runId}`);
  if (!record.approvedSteps.includes(stepName)) record.approvedSteps.push(stepName);
  await store.save(record);
  return record;
}

export interface ReplayRule {
  effect: Effect;
  safeToReplay: boolean;
  needs: string;
}

/**
 * The three line table you actually need when deciding what a resume may redo.
 * `write` is the interesting row: safe, but only because of the key.
 */
export function replayRule(effect: Effect): ReplayRule {
  switch (effect) {
    case "read":
      return { effect, safeToReplay: true, needs: "nothing, a read replays for free" };
    case "write":
      return {
        effect,
        safeToReplay: true,
        needs: "an idempotency key derived from the intent (Session 5)",
      };
    case "irreversible":
      return {
        effect,
        safeToReplay: false,
        needs: "an idempotency key, an audit log entry, and a human-visible receipt",
      };
  }
}

/** Which of these steps would be dangerous to replay after a crash? */
export function unsafeToReplay(steps: StepDef[]): string[] {
  return steps.filter((s) => !replayRule(s.effect).safeToReplay).map((s) => s.name);
}
