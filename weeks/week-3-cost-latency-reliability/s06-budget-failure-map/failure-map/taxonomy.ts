/**
 * S6 · the nine layers, as a checklist you can iterate rather than remember.
 *
 * A four-row failure map is a start, not a map. Walking these layers is what
 * gets you to twenty rows, and the `forgotten` line on each is the failure that
 * survives most reviews because nothing throws when it happens.
 */

export type Layer =
  | "input"
  | "retrieval"
  | "context"
  | "model"
  | "output"
  | "tools"
  | "agent-loop"
  | "data-privacy"
  | "cost-capacity";

export interface LayerGuide {
  layer: Layer;
  label: string;
  /** Ways this layer breaks. Steal the ones that apply to your system. */
  failures: string[];
  /** The one people leave out, and it is usually silent. */
  forgotten: string;
}

export const TAXONOMY: readonly LayerGuide[] = [
  {
    layer: "input",
    label: "Input",
    failures: ["oversized upload", "wrong language", "empty question", "hostile prompt"],
    forgotten: "input that costs money to reject",
  },
  {
    layer: "retrieval",
    label: "Retrieval",
    failures: ["index stale", "embedding model changed", "zero hits", "wrong tenant's docs"],
    forgotten: "a silent tenant leak reads as a good answer",
  },
  {
    layer: "context",
    label: "Context assembly",
    failures: ["window overflow", "truncation mid-document", "ordering breaks the prefix cache"],
    forgotten: "truncation drops the one relevant chunk",
  },
  {
    layer: "model",
    label: "Model call",
    failures: ["timeout", "429", "5xx", "provider outage", "deprecation", "silent version drift"],
    forgotten: "the same prompt scoring worse after a provider update",
  },
  {
    layer: "output",
    label: "Output",
    failures: ["invalid JSON", "refusal", "truncation at max tokens", "hallucinated citation"],
    forgotten: "valid shape, wrong content, which passes every check you have",
  },
  {
    layer: "tools",
    label: "Tools",
    failures: ["wrong args", "side effect retried", "third party down", "slow tool eats the deadline"],
    forgotten: "a tool that succeeds after you already timed out",
  },
  {
    layer: "agent-loop",
    label: "Agent loop",
    failures: ["no progress", "oscillation", "step cap hit mid-task", "spend runaway"],
    forgotten: "the loop that reports success having done nothing",
  },
  {
    layer: "data-privacy",
    label: "Data and privacy",
    failures: ["PII into logs or prompts", "cross-tenant cache hit", "retention breach"],
    forgotten: "the cache key that omits tenant id",
  },
  {
    layer: "cost-capacity",
    label: "Cost and capacity",
    failures: ["quota exhausted", "one tenant burns the month", "load spike queues forever"],
    forgotten: "the bug that arrives as an invoice, 30 days late",
  },
] as const;

/** Layers your map never mentions. Usually where the missing rows are. */
export function uncoveredLayers(covered: Layer[]): Layer[] {
  const seen = new Set(covered);
  return TAXONOMY.map((g) => g.layer).filter((l) => !seen.has(l));
}

export function guideFor(layer: Layer): LayerGuide {
  const guide = TAXONOMY.find((g) => g.layer === layer);
  if (!guide) throw new Error(`guideFor: unknown layer ${layer}`);
  return guide;
}
