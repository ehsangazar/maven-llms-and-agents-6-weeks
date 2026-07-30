/**
 * S5 · designing for failure: what is retryable, and what a retry costs.
 *
 * Seven ways a model call fails, and only three of them are worth trying again.
 * Retrying a 400 does not fix your request, it just spends money slower.
 *
 * Two rules the SDK cannot enforce for you:
 *   - Classify by error CLASS or status, never by matching the message string.
 *     Messages are vendor copy and they change without warning.
 *   - Jitter is not a nicety. Without it every client retries on the same
 *     millisecond and you have arranged a stampede on your own recovery.
 *
 * Sleep and randomness are injected, so the tests are instant and deterministic.
 */

export type FailureKind =
  | "rate-limit" // 429, retryable
  | "server" // 5xx, retryable
  | "connection" // socket / DNS / reset, retryable
  | "timeout" // your deadline fired, retryable only if you have time left
  | "bad-request" // 400, your bug, never retryable
  | "auth" // 401 / 403, never retryable
  | "content-filter"; // refusal, a product decision rather than an outage

export interface ClassifiedError {
  kind: FailureKind;
  status?: number;
}

const RETRYABLE: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "rate-limit",
  "server",
  "connection",
  "timeout",
]);

export function isRetryable(kind: FailureKind): boolean {
  return RETRYABLE.has(kind);
}

/** Classify by status code, which is a contract, rather than by message text, which is not. */
export function classifyStatus(status: number): FailureKind {
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  if (status === 401 || status === 403) return "auth";
  return "bad-request";
}

export interface BackoffOptions {
  baseMs: number;
  capMs: number;
  /** Injected so tests are deterministic. Must return 0..1. */
  random?: () => number;
}

/**
 * Full jitter: exponential ceiling, uniform pick beneath it. Simple, and it
 * beats "exponential plus a little noise" at spreading a thundering herd.
 */
export function backoffMs(attempt: number, opts: BackoffOptions): number {
  if (attempt < 1) throw new Error("backoffMs: attempt starts at 1");
  const random = opts.random ?? Math.random;
  const ceiling = Math.min(opts.capMs, opts.baseMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

export interface RetryOptions {
  /** Total attempts including the first. 3 means one call and two retries. */
  attempts: number;
  backoff: BackoffOptions;
  sleep?: (ms: number) => Promise<void>;
  /** How long one attempt typically takes. Used to refuse a retry there is no time for. */
  attemptCostMs?: number;
  /** Whatever is left of the request's deadline. Retries spend it like anything else. */
  remainingMs?: () => number;
  onRetry?: (info: { attempt: number; waitMs: number; kind: FailureKind }) => void;
}

export interface Attempted<T> {
  value: T;
  attempts: number;
  waitedMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry `fn` while the failure is retryable, there are attempts left, and the
 * request's deadline can still afford another go.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  classify: (err: unknown) => ClassifiedError,
  opts: RetryOptions,
): Promise<Attempted<T>> {
  if (opts.attempts < 1) throw new Error("retry: attempts must be at least 1");
  const sleep = opts.sleep ?? defaultSleep;
  let waitedMs = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt, waitedMs };
    } catch (err) {
      const { kind } = classify(err);
      const lastAttempt = attempt >= opts.attempts;
      if (!isRetryable(kind) || lastAttempt) throw err;

      const waitMs = backoffMs(attempt, opts.backoff);
      const need = waitMs + (opts.attemptCostMs ?? 0);
      if (opts.remainingMs && opts.remainingMs() < need) throw err;

      opts.onRetry?.({ attempt, waitMs, kind });
      await sleep(waitMs);
      waitedMs += waitMs;
    }
  }
}
