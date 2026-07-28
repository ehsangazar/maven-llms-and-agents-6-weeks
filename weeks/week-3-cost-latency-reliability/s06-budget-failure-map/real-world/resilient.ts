/**
 * S6 real-world example, the fallback ladder as a reusable wrapper.
 *
 * The workshop artifact: a small combinator that tries a sequence of steps,
 * catches whatever each one throws (timeout, 5xx, over-budget), and returns the
 * first success, or a safe default if they all fail. Crucially it records which
 * failure modes fired, which is the failure-mode map you draw in the workshop.
 *
 * Pure and deps-injected: steps are functions you pass in, so every failure path
 * is testable with no API key and no real timeouts.
 */
export interface Step<T> {
  name: string;
  run: () => Promise<T>;
}

export interface Outcome<T> {
  value: T;
  via: string;
  failures: { step: string; reason: string }[];
}

/** Try each step in order; first success wins; otherwise the safe default. */
export async function withFallback<T>(steps: Step<T>[], safeDefault: T): Promise<Outcome<T>> {
  const failures: { step: string; reason: string }[] = [];
  for (const step of steps) {
    try {
      return { value: await step.run(), via: step.name, failures };
    } catch (err) {
      failures.push({ step: step.name, reason: (err as Error).message });
    }
  }
  return { value: safeDefault, via: "safe-default", failures };
}

/** Reject if `promise` does not settle within `ms`. Handy for building steps. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
