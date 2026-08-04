/**
 * S7 · the agent loop, with the four things that make it stop.
 *
 * An agent is a `while` loop around a model. Four parts, no more:
 *
 *   policy    the model. Given the history, it picks the next action.
 *   tools     the actions it is allowed to take (`../tools/tool.ts`).
 *   history   what has happened so far, in order.
 *   stop      the reason the loop is allowed to end.
 *
 * Beginners write the first three and forget the fourth. That is the classic
 * agent incident: not a crash, a run that never decides it is finished and
 * bills you for the privilege. So this loop has FOUR independent stops:
 *
 *   done         the policy says it is finished
 *   step_cap     it took too many turns
 *   budget       it spent too much money
 *   no_progress  it repeated itself, which is a loop pretending to be work
 *
 * The policy is a parameter, so this whole file runs, and is tested, with no
 * API key. `../real-world/index.ts` passes in a real model.
 */
import type { Registry, ToolContext, ToolResult } from "../tools/tool.ts";

/** One thing the model asked for. Several in a step means "run them together". */
export interface ToolCall {
  name: string;
  args: unknown;
}

/** What the policy decides after reading the history. */
export type Action =
  | { kind: "final"; text: string }
  | { kind: "tools"; calls: ToolCall[] };

/** One line of history. The model sees these, in order, on every turn. */
export type Entry =
  | { role: "question"; text: string }
  | { role: "call"; name: string; args: unknown }
  | { role: "observation"; name: string; text: string; ok: boolean };

/** The brain. Pure input, pure output: history in, next action out. */
export type Policy = (history: Entry[]) => Promise<{ action: Action; costUsd?: number }>;

export type StopReason = "done" | "step_cap" | "budget" | "no_progress";

export interface AgentOptions {
  maxSteps?: number;
  /** Hard ceiling for the whole run, not per call. */
  budgetUsd?: number;
  /** How many identical calls in a row count as a stuck loop. */
  repeatLimit?: number;
}

export interface AgentRun {
  answer: string;
  stopReason: StopReason;
  steps: number;
  toolCalls: number;
  spentUsd: number;
  history: Entry[];
}

const DEFAULTS = { maxSteps: 8, budgetUsd: 0.5, repeatLimit: 3 };

export async function runAgent(
  question: string,
  policy: Policy,
  registry: Registry,
  ctx: ToolContext,
  options: AgentOptions = {},
): Promise<AgentRun> {
  const { maxSteps, budgetUsd, repeatLimit } = { ...DEFAULTS, ...options };

  const history: Entry[] = [{ role: "question", text: question }];
  const seen = new Map<string, number>(); // fingerprint -> times called
  let spentUsd = 0;
  let toolCalls = 0;
  let stepsTaken = 0;

  for (let step = 1; step <= maxSteps; step++) {
    // Stop BEFORE spending, not after. Checking afterwards means the budget is
    // a report of what you already paid.
    if (spentUsd >= budgetUsd) {
      return stop("budget", `stopped: spent $${spentUsd.toFixed(4)} of the $${budgetUsd} budget`);
    }
    stepsTaken = step;

    const decision = await policy(history);
    spentUsd += decision.costUsd ?? 0;

    if (decision.action.kind === "final") {
      return {
        answer: decision.action.text,
        stopReason: "done",
        steps: step,
        toolCalls,
        spentUsd,
        history,
      };
    }

    const calls = decision.action.calls;

    // The same call, again and again, is the model spinning. It looks like work
    // and costs like work. Catch it here rather than at the step cap.
    for (const call of calls) {
      const key = fingerprint(call);
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count >= repeatLimit) {
        return stop(
          "no_progress",
          `stopped: called ${call.name} with the same arguments ${count} times`,
        );
      }
    }

    for (const call of calls) history.push({ role: "call", name: call.name, args: call.args });

    // Independent calls in one step run together. This is where a lot of agent
    // latency hides: three sequential lookups that never needed to be in order.
    const results = await Promise.all(
      calls.map((call): Promise<ToolResult> => registry.call(call.name, call.args, ctx)),
    );
    toolCalls += results.length;

    results.forEach((result, i) => {
      const call = calls[i];
      if (!call) return;
      history.push({ role: "observation", name: call.name, text: result.observation, ok: result.ok });
    });
  }

  return stop("step_cap", `stopped: reached the ${maxSteps} step cap without finishing`);

  function stop(stopReason: StopReason, answer: string): AgentRun {
    return { answer, stopReason, steps: stepsTaken, toolCalls, spentUsd, history };
  }
}

/** Same tool, same arguments = the same step. Order inside the args must not matter. */
function fingerprint(call: ToolCall): string {
  return `${call.name}(${stable(call.args)})`;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(",")}}`;
}

/**
 * Render the history for the model. Kept tiny on purpose: the interesting
 * question of what to keep and what to drop is Session 3's, not this file's.
 */
export function renderHistory(history: Entry[]): string {
  return history
    .map((entry) => {
      if (entry.role === "question") return `Q: ${entry.text}`;
      if (entry.role === "call") return `call ${entry.name}(${JSON.stringify(entry.args)})`;
      return `observation ${entry.name}: ${entry.text}`;
    })
    .join("\n");
}
