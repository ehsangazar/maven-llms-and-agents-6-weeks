/**
 * S5 · lever 2, batching.
 *
 * Three different things get called "batching". This is the one you write
 * yourself: a micro-batcher that collects in-flight requests and flushes on
 * SIZE or TIME, whichever comes first. The time bound is not optional. Without
 * it a quiet period leaves the first caller waiting for a batch that will never
 * fill, and you have traded cost for an unbounded latency tail.
 *
 * The timer is injected, so the tests drive time by hand and never sleep.
 */

export type Scheduler = (fn: () => void, ms: number) => { cancel: () => void };

export const realScheduler: Scheduler = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(t) };
};

export interface BatcherOptions<In, Out> {
  maxSize: number;
  maxWaitMs: number;
  /** Runs one batch. Must return one result per input, in the same order. */
  run: (items: In[]) => Promise<Out[]>;
  scheduler?: Scheduler;
}

interface Pending<In, Out> {
  item: In;
  resolve: (out: Out) => void;
  reject: (err: unknown) => void;
}

export interface Batcher<In, Out> {
  /** Submit one item; resolves when its batch runs. */
  submit: (item: In) => Promise<Out>;
  /** Flush now, whatever is queued. Useful on shutdown. */
  flush: () => Promise<void>;
  queueDepth: () => number;
}

export function createBatcher<In, Out>(opts: BatcherOptions<In, Out>): Batcher<In, Out> {
  if (opts.maxSize < 1) throw new Error("createBatcher: maxSize must be at least 1");
  if (opts.maxWaitMs < 0) throw new Error("createBatcher: maxWaitMs must not be negative");

  const scheduler = opts.scheduler ?? realScheduler;
  let queue: Pending<In, Out>[] = [];
  let timer: { cancel: () => void } | undefined;

  async function flush(): Promise<void> {
    timer?.cancel();
    timer = undefined;
    if (queue.length === 0) return;

    const batch = queue;
    queue = [];

    try {
      const results = await opts.run(batch.map((p) => p.item));
      if (results.length !== batch.length) {
        throw new Error(
          `batch run returned ${results.length} results for ${batch.length} items`,
        );
      }
      batch.forEach((p, i) => p.resolve(results[i] as Out));
    } catch (err) {
      // One bad batch must not strand its callers waiting forever.
      for (const p of batch) p.reject(err);
    }
  }

  return {
    submit(item) {
      return new Promise<Out>((resolve, reject) => {
        queue.push({ item, resolve, reject });
        if (queue.length >= opts.maxSize) {
          void flush();
          return;
        }
        // First item in an empty batch starts the clock. The deadline belongs to
        // the batch, not to each arrival, or a steady trickle never flushes.
        timer ??= scheduler(() => void flush(), opts.maxWaitMs);
      });
    },
    flush,
    queueDepth: () => queue.length,
  };
}
