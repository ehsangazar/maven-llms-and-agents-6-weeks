/**
 * S4 real-world example, a context pipeline with two rules the raw retriever
 * does not give you: dedup and freshness.
 *
 * A naive top-k retrieval returns near-duplicate snippets and stale docs that
 * outrank fresher ones. The pipeline here de-duplicates, decays relevance by
 * age, then packs under a budget. This is the workshop artifact: the shape of
 * the pipeline you design before Lab 2 builds the real retriever underneath it.
 *
 * Pure and deterministic: no model, no key, and age is passed in rather than
 * read from the clock so the tests stay stable.
 */
export interface Doc {
  id: string;
  text: string;
  /** How old this doc is, in days. */
  ageDays: number;
  /** Raw relevance from the retriever, 0..1. */
  relevance: number;
}

/** Relevance decayed by age: a fresh doc beats a stale one at equal relevance. */
export function freshnessScore(doc: Doc): number {
  return doc.relevance * Math.pow(0.98, doc.ageDays);
}

/**
 * Dedup by normalized text (keeping the freshest copy), rank by freshness-
 * adjusted relevance, then pack under a character budget.
 */
export function prepareContext(docs: Doc[], budgetChars: number): Doc[] {
  const freshestByText = new Map<string, Doc>();
  for (const doc of docs) {
    const key = doc.text.trim().toLowerCase();
    const prev = freshestByText.get(key);
    if (!prev || doc.ageDays < prev.ageDays) freshestByText.set(key, doc);
  }

  const ranked = [...freshestByText.values()].sort(
    (a, b) => freshnessScore(b) - freshnessScore(a),
  );

  const out: Doc[] = [];
  let used = 0;
  for (const doc of ranked) {
    if (used + doc.text.length <= budgetChars) {
      out.push(doc);
      used += doc.text.length;
    }
  }
  return out;
}
