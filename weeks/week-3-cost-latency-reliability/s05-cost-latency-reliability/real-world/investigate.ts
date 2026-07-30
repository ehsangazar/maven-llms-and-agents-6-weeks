/**
 * S5 real-world · a production bug investigator that survives the incident.
 *
 * An on-call assistant: given an alert, correlate recent deploys, pull the logs
 * that matter, and propose a cause with evidence. It is a good vehicle for this
 * session because it fails in all four ways at once.
 *
 *   COST      logs are enormous. Naive is "paste 200k tokens and hope". The
 *             search is the lever, not the model.
 *   LATENCY   the page is firing. An answer at 40 seconds is not an answer.
 *   FAILURE   the log backend is degraded BECAUSE there is an incident. The
 *             dependency you need is the one that is down.
 *   BLINDNESS a confidently wrong cause sends on-call down a 40-minute hole,
 *             during an outage. Refusing is cheaper than guessing.
 *
 * Everything is injected, so the whole thing runs offline in the tests. It wires
 * up this session's own modules rather than reimplementing them: the Deadline
 * from ../latency, the CircuitBreaker from ../reliability.
 */

import { PRICES, costOfCall, type TokenPrice } from "../cost/price.ts";
import { Deadline } from "../latency/deadline.ts";
import { CircuitBreaker } from "../reliability/breaker.ts";
import type { Alert, Deploy, LogLine } from "./incident.ts";

export interface Hypothesis {
  cause: string;
  /** Log lines or deploys it is leaning on. Empty means it is guessing. */
  evidence: string[];
  confident: boolean;
  nextAction: string;
}

export interface InvestigatorDeps {
  listDeploys(sinceMinutes: number): Promise<Deploy[]>;
  /** The one that goes down during an incident. */
  searchLogs(query: string, limit: number): Promise<LogLine[]>;
  ask(input: { alert: Alert; deploys: Deploy[]; logs: LogLine[] }): Promise<Hypothesis>;
}

export interface Guards {
  /** Hard cap on model calls. Without it the loop is your budget. */
  maxSteps: number;
  /** Dollars for the whole investigation. */
  spendCeiling: number;
  /** On-call is watching a page. This is not negotiable upward. */
  deadlineMs: number;
  /** How many log lines may reach the prompt. The cheapest token is the one you never send. */
  maxLogLines: number;
  price: TokenPrice;
  /** Instructions, alert and deploys: the part that does not grow with the log window. */
  basePromptTokens: number;
  tokensPerLogLine: number;
  outputTokens: number;
  costPerSearch: number;
  now?: () => number;
}

export const DEFAULT_GUARDS: Guards = {
  maxSteps: 3,
  spendCeiling: 0.15,
  deadlineMs: 10_000,
  maxLogLines: 20,
  price: PRICES.large,
  basePromptTokens: 400,
  tokensPerLogLine: 14,
  outputTokens: 300,
  costPerSearch: 0.0005,
};

/**
 * Both paths in this file price through the same function, deliberately. A
 * comparison where the two sides count cost differently proves nothing.
 */
export function askCost(logLines: number, guards: Guards): number {
  return costOfCall({
    name: "ask",
    inputTokens: guards.basePromptTokens + logLines * guards.tokensPerLogLine,
    outputTokens: guards.outputTokens,
    price: guards.price,
  }).total;
}

/** How the answer was reached. Put this on the incident timeline, not just in a log. */
export type ServedBy = "grounded" | "deploy-only" | "no-answer";

export interface Investigation {
  hypothesis: Hypothesis | null;
  servedBy: ServedBy;
  steps: number;
  spent: number;
  degraded: boolean;
  /** Every rung that failed on the way, which is the failure-mode map writing itself. */
  failures: { step: string; reason: string }[];
  /** Why it stopped: answered, or which guard fired. */
  stoppedBy: "answered" | "steps" | "spend" | "deadline" | "no-evidence";
}

export async function investigate(
  alert: Alert,
  deps: InvestigatorDeps,
  guards: Guards = DEFAULT_GUARDS,
  breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 30_000, now: guards.now }),
): Promise<Investigation> {
  const deadline = new Deadline(guards.deadlineMs, guards.now);
  const failures: { step: string; reason: string }[] = [];
  let spent = 0;
  let steps = 0;
  let degraded = false;

  const afford = (cost: number) => spent + cost <= guards.spendCeiling;

  // 1. Deploys first: cheap, fast, and the answer surprisingly often.
  let deploys: Deploy[] = [];
  try {
    deploys = await deps.listDeploys(30);
  } catch (err) {
    failures.push({ step: "list-deploys", reason: (err as Error).message });
    degraded = true;
  }

  // 2. Logs, through a breaker, because this is the thing that is down.
  let logs: LogLine[] = [];
  const queries = [`${alert.service} level:error`, `${alert.service} level:warn`];
  for (const query of queries) {
    if (deadline.expired()) break;
    if (!afford(guards.costPerSearch)) break;
    try {
      const found = await breaker.run(() => deps.searchLogs(query, guards.maxLogLines));
      spent += guards.costPerSearch;
      logs.push(...found);
      if (logs.length >= guards.maxLogLines) break;
    } catch (err) {
      failures.push({ step: `search-logs(${query})`, reason: (err as Error).message });
      degraded = true;
      break; // an open breaker will not answer the second query either
    }
  }
  logs = logs.slice(0, guards.maxLogLines);

  // 3. Ask, and escalate at most as far as the guards allow.
  let hypothesis: Hypothesis | null = null;
  let stoppedBy: Investigation["stoppedBy"] = "answered";

  const perAsk = askCost(logs.length, guards);

  while (steps < guards.maxSteps) {
    if (deadline.expired()) {
      stoppedBy = "deadline";
      break;
    }
    if (!afford(perAsk)) {
      stoppedBy = "spend";
      break;
    }

    steps++;
    spent += perAsk;
    try {
      hypothesis = await deps.ask({ alert, deploys, logs });
    } catch (err) {
      failures.push({ step: `ask#${steps}`, reason: (err as Error).message });
      continue;
    }
    if (hypothesis.confident) break;
    if (steps >= guards.maxSteps) stoppedBy = "steps";
  }

  // 4. Fail closed on grounding. During an incident, "here is what I checked and
  //    I do not know" beats a plausible cause that costs someone 40 minutes.
  if (!hypothesis || hypothesis.evidence.length === 0) {
    const servedBy: ServedBy = deploys.length > 0 ? "deploy-only" : "no-answer";
    return {
      hypothesis: hypothesis && hypothesis.evidence.length > 0 ? hypothesis : null,
      servedBy,
      steps,
      spent,
      degraded,
      failures,
      stoppedBy: stoppedBy === "answered" ? "no-evidence" : stoppedBy,
    };
  }

  return { hypothesis, servedBy: "grounded", steps, spent, degraded, failures, stoppedBy };
}

/**
 * The naive version, for the replay. One call, every log line in the prompt, no
 * deadline, no ceiling, no breaker. It is not a straw man: it is the first
 * version of this that everyone writes.
 */
export async function investigateNaively(
  alert: Alert,
  deps: InvestigatorDeps,
  allLogs: LogLine[],
  guards: Guards = DEFAULT_GUARDS,
): Promise<{ hypothesis: Hypothesis; spent: number; promptTokens: number }> {
  const deploys = await deps.listDeploys(30);
  const hypothesis = await deps.ask({ alert, deploys, logs: allLogs });
  return {
    hypothesis,
    spent: askCost(allLogs.length, guards),
    promptTokens: guards.basePromptTokens + allLogs.length * guards.tokensPerLogLine,
  };
}
