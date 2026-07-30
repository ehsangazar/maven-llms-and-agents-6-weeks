/**
 * S5 · the cost model, as arithmetic you can run.
 *
 * The lesson claim is that "cheap enough" is a number, and that the number is a
 * sum you can write down before you optimise anything. This file is that sum.
 *
 * Three things it makes concrete:
 *   1. cost = (input x price_in) + (output x price_out), per call
 *   2. a request is not a call: routers, re-asks, retries and agent loops
 *      multiply it, and the worst case is the number that surprises people
 *   3. a ceiling is a business number, derived from price and usage, not a
 *      preference you defend in a meeting
 *
 * No network, no key. Pure arithmetic, so the tests are the spec.
 */

/** Vendor prices, in dollars per million tokens. */
export interface TokenPrice {
  inputPerM: number;
  outputPerM: number;
  /** Prompt-cache reads are usually a fraction of the input price. */
  cachedInputPerM: number;
}

/** Illustrative tiers. The ratio between them is the point, not the digits. */
export const PRICES = {
  small: { inputPerM: 0.15, outputPerM: 0.6, cachedInputPerM: 0.015 },
  large: { inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3 },
} as const satisfies Record<string, TokenPrice>;

/**
 * One model call, counted. `cachedInputTokens` is the slice of the input that
 * hit the prompt cache, so it is billed at the cached rate instead.
 */
export interface CallShape {
  name: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  price: TokenPrice;
}

export interface CallCost {
  input: number;
  output: number;
  total: number;
  /** What the prompt cache saved on this call, in dollars. */
  cacheSaving: number;
}

const perM = (tokens: number, pricePerM: number) => (tokens / 1_000_000) * pricePerM;

export function costOfCall(call: CallShape): CallCost {
  const cached = Math.min(call.cachedInputTokens ?? 0, call.inputTokens);
  const fresh = call.inputTokens - cached;

  const input = perM(fresh, call.price.inputPerM) + perM(cached, call.price.cachedInputPerM);
  const output = perM(call.outputTokens, call.price.outputPerM);
  const uncached = perM(call.inputTokens, call.price.inputPerM) + output;

  return { input, output, total: input + output, cacheSaving: uncached - (input + output) };
}

/**
 * Which side of the bill dominates. Nearly always `input`, because most of what
 * you pay for is prompt and retrieved context you assembled rather than typed.
 */
export function dominantTerm(cost: CallCost): "input" | "output" {
  return cost.input >= cost.output ? "input" : "output";
}

/**
 * A call that only happens some of the time: a validation re-ask, a transport
 * retry, an escalation to the big model. `rate` is how often it fires in the
 * typical case; `worstCaseCount` is how many times it can fire at worst.
 *
 * If you cannot state `worstCaseCount`, that is not a budgeting gap. It is a
 * missing loop limit.
 */
export interface Amplifier {
  rate: number;
  worstCaseCount: number;
  call: CallShape;
}

/** Everything one user action can cost: the calls you always make, plus the amplifiers. */
export interface RequestPlan {
  always: CallShape[];
  amplifiers: Amplifier[];
}

/** The number you put in the budget as "typical". */
export function expectedCost(plan: RequestPlan): number {
  const base = plan.always.reduce((sum, c) => sum + costOfCall(c).total, 0);
  const extra = plan.amplifiers.reduce((sum, a) => sum + a.rate * costOfCall(a.call).total, 0);
  return base + extra;
}

/** The number that shows up as a surprise invoice if you never wrote it down. */
export function worstCaseCost(plan: RequestPlan): number {
  const base = plan.always.reduce((sum, c) => sum + costOfCall(c).total, 0);
  const extra = plan.amplifiers.reduce(
    (sum, a) => sum + a.worstCaseCount * costOfCall(a.call).total,
    0,
  );
  return base + extra;
}

/** Unbounded amplifiers, by name. A non-empty list is a design bug, not a rounding error. */
export function unboundedAmplifiers(plan: RequestPlan): string[] {
  return plan.amplifiers
    .filter((a) => !Number.isFinite(a.worstCaseCount))
    .map((a) => a.call.name);
}

export interface UnitEconomics {
  /** What one seat pays you per month. */
  pricePerSeat: number;
  /** How many of these requests one seat makes per month. Measured, not hoped. */
  requestsPerSeat: number;
}

/** What fraction of revenue this request eats at a given per-request cost. */
export function revenueShare(costPerRequest: number, unit: UnitEconomics): number {
  if (unit.pricePerSeat <= 0) throw new Error("revenueShare: pricePerSeat must be positive");
  return (costPerRequest * unit.requestsPerSeat) / unit.pricePerSeat;
}

/**
 * Work backwards: given the share of revenue you are willing to spend, what is
 * the per-request ceiling? This is where a defensible ceiling comes from.
 */
export function ceilingForShare(targetShare: number, unit: UnitEconomics): number {
  if (unit.requestsPerSeat <= 0) throw new Error("ceilingForShare: requestsPerSeat must be positive");
  return (targetShare * unit.pricePerSeat) / unit.requestsPerSeat;
}
