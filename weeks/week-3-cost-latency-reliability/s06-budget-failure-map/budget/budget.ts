/**
 * S6 · the budget, as a typed artifact you can lint.
 *
 * The workshop asks for a budget with real numbers, a worst case bounded by
 * something in the code, a latency ceiling split across the hops, and a note of
 * which numbers are measured and which are guesses.
 *
 * All four of those are checkable, so they are checked here rather than left to
 * a reviewer's patience. `reviewBudget` is the "mark your own work" slide with
 * a return type.
 */

/** Where a number came from. An estimate you can trace is an artifact; one you cannot is a wish. */
export type Confidence = "measured" | "counted" | "vendor" | "analogous" | "guessed";

export interface Figure {
  value: number;
  confidence: Confidence;
  /** Required for a guess: when you will replace it with something better. */
  replaceBy?: string;
  note?: string;
}

export interface HopBudget {
  name: string;
  budgetMs: number;
}

export interface RequestBudget {
  /** Name it as a user action, not as an endpoint. */
  request: string;
  cost: {
    typical: Figure;
    worst: Figure;
    /** Why the ceiling is this number. Arithmetic, not preference. */
    because: string;
  };
  latency: {
    ceilingMs: Figure;
    firstTokenMs?: Figure;
    hops: HopBudget[];
    headroomFraction: number;
  };
  calls: {
    typical: number;
    /** Must be finite. If you cannot bound it, you are missing a loop limit, not a number. */
    hardMax: number;
  };
  dominantCost: "input" | "output" | "calls" | "retries";
  leversOn: string[];
}

export interface BudgetReview {
  ok: boolean;
  violations: string[];
  warnings: string[];
  workMs: number;
  headroomMs: number;
}

const ENDPOINT_SHAPED = /(endpoint|\/api\/|route|handler)/i;

export function reviewBudget(budget: RequestBudget): BudgetReview {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (ENDPOINT_SHAPED.test(budget.request)) {
    warnings.push(
      `request "${budget.request}" is named like an endpoint: name the user action, so the prompt contents stay honest`,
    );
  }

  // 1. Real numbers, with a reason behind the ceiling.
  if (budget.cost.typical.value <= 0) violations.push("typical cost ceiling is not a real number");
  if (budget.cost.because.trim().length < 15) {
    violations.push("cost ceiling has no reasoning: a ceiling without arithmetic gets negotiated away");
  }

  // 2. A worst case, bounded by something in the code.
  if (!Number.isFinite(budget.cost.worst.value)) {
    violations.push("worst-case cost is unbounded");
  } else if (budget.cost.worst.value <= budget.cost.typical.value) {
    violations.push("worst case is not above typical: one of the two numbers is wrong");
  }
  if (!Number.isFinite(budget.calls.hardMax)) {
    violations.push("calls per request have no hard maximum: that is a missing loop limit, not a missing number");
  } else if (budget.calls.hardMax < budget.calls.typical) {
    violations.push("hard call maximum is below the typical call count");
  }

  // 3. The latency ceiling splits across hops, with headroom left to degrade.
  const workMs = budget.latency.hops.reduce((sum, h) => sum + h.budgetMs, 0);
  const headroomMs = budget.latency.ceilingMs.value * budget.latency.headroomFraction;
  if (budget.latency.hops.length === 0) {
    violations.push("latency ceiling is one number: split it across the hops or no hop knows what to do");
  }
  if (budget.latency.headroomFraction < 0.15) {
    violations.push("less than 15 percent headroom: the fallback ladder has nowhere to run");
  }
  if (workMs + headroomMs > budget.latency.ceilingMs.value) {
    violations.push(
      `hops (${workMs}ms) plus headroom (${Math.round(headroomMs)}ms) exceed the ${budget.latency.ceilingMs.value}ms ceiling`,
    );
  }
  for (const hop of budget.latency.hops) {
    if (hop.budgetMs <= 0) violations.push(`hop "${hop.name}" has no deadline of its own`);
  }

  // 4. Every number carries its source, and every guess carries an expiry.
  for (const [label, figure] of figures(budget)) {
    if (figure.confidence === "guessed" && !figure.replaceBy) {
      violations.push(`"${label}" is a guess with no date to replace it`);
    }
  }
  if (budget.leversOn.length === 0) {
    warnings.push("no levers ticked: a budget with no levers is a hope with a number on it");
  }

  return { ok: violations.length === 0, violations, warnings, workMs, headroomMs };
}

function figures(budget: RequestBudget): [string, Figure][] {
  const out: [string, Figure][] = [
    ["cost.typical", budget.cost.typical],
    ["cost.worst", budget.cost.worst],
    ["latency.ceilingMs", budget.latency.ceilingMs],
  ];
  if (budget.latency.firstTokenMs) out.push(["latency.firstTokenMs", budget.latency.firstTokenMs]);
  return out;
}

/** How much of the budget is still resting on guesses. Worth saying out loud in a review. */
export function guessCount(budget: RequestBudget): number {
  return figures(budget).filter(([, f]) => f.confidence === "guessed").length;
}
