/**
 * S5 · lever 1, the two caches.
 *
 * There are two, and they are not the same thing:
 *
 *   1. The PREFIX cache lives at the vendor. It is a prefix match, so ordering
 *      is the whole game: stable content first, volatile content last. Put the
 *      user's question above your system prompt and you have turned the cache
 *      off without changing a single price.
 *
 *   2. The ANSWER cache lives with you. It is a lookup, so the KEY is the whole
 *      game. Leave the tenant out of the key and you have built a cross-tenant
 *      leak that returns 200 OK with somebody else's data in it.
 *
 * The clock is injected so TTL behaviour is testable without waiting.
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PromptParts {
  /** Fixed for every request: instructions, tool schemas, policy. */
  systemAndTools: string;
  /** Stable within a session or a document set, but not across all requests. */
  retrieved: string[];
  /** Changes every turn. */
  history: Message[];
  question: string;
}

/**
 * Order a prompt so the cacheable part is a genuine prefix: system and tools,
 * then retrieval, then the volatile tail. Nothing clever, and that is the point.
 */
export function orderForPrefixCache(parts: PromptParts): Message[] {
  return [
    { role: "system", content: parts.systemAndTools },
    ...parts.retrieved.map((chunk): Message => ({ role: "system", content: chunk })),
    ...parts.history,
    { role: "user", content: parts.question },
  ];
}

/**
 * How many leading characters two prompts share. Real prefix caches match on
 * tokens, but the property you care about is identical here: the length of the
 * shared head is what you get billed at the cheap rate.
 */
export function sharedPrefixLength(a: Message[], b: Message[]): number {
  const flatten = (m: Message[]) => m.map((x) => `${x.role}:${x.content}`).join("\n");
  const left = flatten(a);
  const right = flatten(b);
  let i = 0;
  while (i < left.length && i < right.length && left[i] === right[i]) i++;
  return i;
}

export interface AnswerCacheKeyParts {
  /** Never optional. A cache key without a tenant is a data-leak waiting to be found. */
  tenantId: string;
  question: string;
  /** Bump this when the corpus or the prompt changes, so stale answers expire by construction. */
  contextVersion: string;
}

/** Normalise only what is safe to normalise: whitespace and case, nothing semantic. */
export function answerCacheKey(parts: AnswerCacheKeyParts): string {
  if (!parts.tenantId) throw new Error("answerCacheKey: tenantId is required");
  const question = parts.question.trim().toLowerCase().replace(/\s+/g, " ");
  return `${parts.tenantId}::${parts.contextVersion}::${question}`;
}

export interface CacheStats {
  hits: number;
  misses: number;
  expired: number;
}

export type Clock = () => number;

/**
 * A TTL cache for whole answers. Small enough to read in one sitting, which is
 * roughly the level of magic this deserves.
 */
export class AnswerCache<T> {
  private readonly entries = new Map<string, { value: T; storedAt: number }>();
  private readonly stats: CacheStats = { hits: 0, misses: 0, expired: 0 };

  constructor(
    private readonly ttlMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return undefined;
    }
    this.stats.hits++;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, storedAt: this.now() });
  }

  /** How old the entry under `key` is, in ms. Worth graphing: stale answers are a silent failure. */
  ageMs(key: string): number | undefined {
    const entry = this.entries.get(key);
    return entry ? this.now() - entry.storedAt : undefined;
  }

  report(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return { ...this.stats, hitRate: total === 0 ? 0 : this.stats.hits / total };
  }
}

/**
 * Hit rate turns into money linearly: a 40 percent hit rate is 40 percent off
 * the model bill, no more and no less. Latency does not behave this way, which
 * is why you quote them separately.
 */
export function savedByCache(costPerCall: number, calls: number, hitRate: number): number {
  return costPerCall * calls * hitRate;
}
