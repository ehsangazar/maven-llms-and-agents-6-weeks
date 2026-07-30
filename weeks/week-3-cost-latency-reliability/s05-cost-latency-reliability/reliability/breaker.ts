/**
 * S5 · the circuit breaker: stop retrying a corpse.
 *
 * When a dependency is genuinely down, retrying every request turns a fast
 * failure into a slow one and holds your threads while it does. The breaker
 * turns a slow outage into a fast one, which is the only kind you can degrade
 * around inside a latency budget.
 *
 *   closed     normal. count consecutive failures.
 *   open       short-circuit immediately. no calls go out at all.
 *   half-open  after a cooldown, let a small number through as probes.
 *
 * The clock is injected, so the cooldown is a function call rather than a wait.
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Consecutive failures that trip it. */
  failureThreshold: number;
  /** How long it stays open before probing. */
  cooldownMs: number;
  /** Probe successes needed to close again. */
  successThreshold?: number;
  now?: () => number;
}

export class BreakerOpenError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`circuit open, retry in ${retryAfterMs}ms`);
    this.name = "BreakerOpenError";
  }
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private probeSuccesses = 0;
  private openedAt = 0;
  private readonly now: () => number;
  private readonly successThreshold: number;

  constructor(private readonly opts: BreakerOptions) {
    if (opts.failureThreshold < 1) throw new Error("CircuitBreaker: failureThreshold must be at least 1");
    this.now = opts.now ?? Date.now;
    this.successThreshold = opts.successThreshold ?? 1;
  }

  /** Current state, after applying any cooldown that has elapsed. */
  current(): BreakerState {
    if (this.state === "open" && this.now() - this.openedAt >= this.opts.cooldownMs) {
      this.state = "half-open";
      this.probeSuccesses = 0;
    }
    return this.state;
  }

  /**
   * Run `fn` unless the circuit is open. An open circuit throws immediately and
   * cheaply, which is the whole point: your ladder gets the time it needs.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.current() === "open") {
      throw new BreakerOpenError(this.opts.cooldownMs - (this.now() - this.openedAt));
    }
    try {
      const value = await fn();
      this.onSuccess();
      return value;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.probeSuccesses++;
      if (this.probeSuccesses >= this.successThreshold) this.close();
      return;
    }
    this.failures = 0;
  }

  private onFailure(): void {
    // A failed probe reopens immediately: one bad probe is enough evidence.
    if (this.state === "half-open") {
      this.trip();
      return;
    }
    this.failures++;
    if (this.failures >= this.opts.failureThreshold) this.trip();
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = this.now();
    this.failures = 0;
    this.probeSuccesses = 0;
  }

  private close(): void {
    this.state = "closed";
    this.failures = 0;
    this.probeSuccesses = 0;
  }
}
