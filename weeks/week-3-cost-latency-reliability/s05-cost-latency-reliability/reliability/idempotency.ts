/**
 * S5 · the retry gotcha: a retried side effect is a double charge.
 *
 * Everything above this file makes retries more likely, not less. That is fine
 * for a read. It is an incident for anything that moves money, sends a message
 * or opens a ticket.
 *
 * The fix is an idempotency key derived from INTENT, not from the attempt.
 * "This user, this order, this action" produces the same key on every retry, so
 * the second attempt returns the first attempt's result instead of doing the
 * work twice. Deriving it from a timestamp or a random id defeats the entire
 * mechanism, quietly, which is why that case is a test below.
 */

/** A small, stable, dependency-free hash. Good enough for a key, not for security. */
export function stableHash(input: string): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 + c, 1597334677) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, "0");
}

/** The intent, not the attempt: who, what, and which thing. */
export interface Intent {
  tenantId: string;
  action: string;
  /** Whatever identifies the target: an order id, a ticket id, a message id. */
  subject: string;
  /** Anything else that makes two requests genuinely different. */
  discriminators?: Record<string, string | number>;
}

export function idempotencyKey(intent: Intent): string {
  if (!intent.tenantId) throw new Error("idempotencyKey: tenantId is required");
  const extra = Object.entries(intent.discriminators ?? {})
    .sort(([a], [b]) => a.localeCompare(b)) // key order must not change the key
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return stableHash(`${intent.tenantId}|${intent.action}|${intent.subject}|${extra}`);
}

export interface EffectStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

/** An in-memory store, so the tests need no infrastructure. Use your database in anger. */
export class MemoryEffectStore<T> implements EffectStore<T> {
  private readonly map = new Map<string, T>();
  async get(key: string): Promise<T | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
  get size(): number {
    return this.map.size;
  }
}

export interface OnceResult<T> {
  value: T;
  /** True when this call did the work; false when it replayed an earlier result. */
  performed: boolean;
}

/**
 * Run `effect` at most once per key.
 *
 * `inFlight` also collapses concurrent callers, because two retries racing is
 * the common case in an outage, and a store check alone does not stop them.
 */
export function createOnce<T>(store: EffectStore<T>) {
  const inFlight = new Map<string, Promise<T>>();

  return async function once(key: string, effect: () => Promise<T>): Promise<OnceResult<T>> {
    const existing = await store.get(key);
    if (existing !== undefined) return { value: existing, performed: false };

    const running = inFlight.get(key);
    if (running) return { value: await running, performed: false };

    const promise = effect();
    inFlight.set(key, promise);
    try {
      const value = await promise;
      await store.set(key, value);
      return { value, performed: true };
    } finally {
      inFlight.delete(key);
    }
  };
}
