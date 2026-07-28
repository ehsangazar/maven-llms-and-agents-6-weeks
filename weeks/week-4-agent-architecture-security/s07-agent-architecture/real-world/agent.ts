/**
 * S7 real-world example, a ReAct loop and the guardrail that contains its worst
 * failure mode.
 *
 * The agent alternates: the policy (the "brain") picks an action, a tool runs,
 * the observation goes back into the history, repeat until the policy says it is
 * done. The characteristic failure is not a crash, it is a runaway: a policy
 * that never decides it is finished. The step cap is the boring guardrail that
 * turns "loops forever and bills forever" into "stops and says so".
 *
 * Pure and deps-injected: the policy and tools arrive as parameters, so the loop
 * and its cap are testable with no API key.
 */
export type Action =
  | { kind: "tool"; name: string; arg: string }
  | { kind: "final"; text: string };

/** The brain: decides the next action given the history so far. */
export type Policy = (history: string[]) => Promise<Action>;

/** Each tool takes a string arg and returns an observation. */
export type Tools = Record<string, (arg: string) => Promise<string>>;

export interface AgentRun {
  answer: string;
  steps: number;
  hitCap: boolean;
  history: string[];
}

export async function runAgent(
  question: string,
  policy: Policy,
  tools: Tools,
  maxSteps = 5,
): Promise<AgentRun> {
  const history = [`Q: ${question}`];

  for (let step = 1; step <= maxSteps; step++) {
    const action = await policy(history);

    if (action.kind === "final") {
      return { answer: action.text, steps: step, hitCap: false, history };
    }

    const tool = tools[action.name];
    const observation = tool ? await tool(action.arg) : `no such tool: ${action.name}`;
    history.push(`${action.name}(${action.arg}) -> ${observation}`);
  }

  return { answer: "stopped: step cap reached", steps: maxSteps, hitCap: true, history };
}
