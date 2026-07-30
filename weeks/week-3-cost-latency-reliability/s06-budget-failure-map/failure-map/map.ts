/**
 * S6 · the failure-mode map, scored and ranked.
 *
 * Three numbers, one to five each:
 *   likelihood  how often
 *   blast       how bad, on the written scale below, not on a feeling
 *   blindness   how long before you would know
 *
 * Blindness is the LLM twist on classic FMEA. A loud failure you catch in
 * seconds is manageable at almost any severity. A silent one you find in a
 * customer email three weeks later is not, which is why the model timeout
 * everybody codes for ranks near the bottom of a real map.
 */

import type { Layer } from "./taxonomy.ts";

export type Score = 1 | 2 | 3 | 4 | 5;

/** The written scale, so "high impact" means the same thing to everyone in the room. */
export const BLAST_SCALE: Record<Score, string> = {
  1: "cosmetic, one request",
  2: "one user, one session",
  3: "one tenant, sustained",
  4: "all users, feature down",
  5: "money, data, or trust, and it may not be reversible",
};

/** Every row needs a verb. "Monitor closely" is not one of these. */
export type MitigationClass = "prevent" | "detect" | "degrade" | "recover" | "accept";

export interface FailureRow {
  layer: Layer;
  failure: string;
  likelihood: Score;
  blast: Score;
  blindness: Score;
  mitigation: { class: MitigationClass; how: string };
  /** The metric that moves when this fires. Absent means nothing on a dashboard would. */
  signal?: string;
  /** True when nothing throws: no exception, no 500, latency stays green. */
  silent: boolean;
}

export function score(row: FailureRow): number {
  return row.likelihood * row.blast * row.blindness;
}

/** Highest score first. Ties break on blast radius, because that is the part that hurts. */
export function rank(rows: FailureRow[]): FailureRow[] {
  return [...rows].sort((a, b) => score(b) - score(a) || b.blast - a.blast);
}

export function silentShare(rows: FailureRow[]): number {
  if (rows.length === 0) return 0;
  return rows.filter((r) => r.silent).length / rows.length;
}

export interface MapReview {
  ok: boolean;
  violations: string[];
  warnings: string[];
  top: FailureRow[];
}

export interface MapReviewOptions {
  /** Rows at or above this score are treated as "must have a signal". */
  signalThreshold?: number;
  /** Minimum share of rows that should be silent failures. */
  minSilentShare?: number;
  minRows?: number;
}

/**
 * The workshop's own rubric, executable. Run it on your map before your reviewer does.
 */
export function reviewMap(rows: FailureRow[], opts: MapReviewOptions = {}): MapReview {
  const signalThreshold = opts.signalThreshold ?? 24;
  const minSilentShare = opts.minSilentShare ?? 0.5;
  const minRows = opts.minRows ?? 10;

  const violations: string[] = [];
  const warnings: string[] = [];

  if (rows.length < minRows) {
    warnings.push(
      `${rows.length} rows: thin maps are always missing the quiet failures, walk the nine layers again`,
    );
  }

  for (const row of rows) {
    // Money, data or trust needs a hard control. Detecting it afterwards is not a plan.
    if (row.blast === 5 && row.mitigation.class !== "prevent") {
      violations.push(
        `"${row.failure}" is blast 5 but only "${row.mitigation.class}": a score-5 row needs prevent, not best efforts`,
      );
    }
    if (row.mitigation.how.trim().length < 8) {
      violations.push(`"${row.failure}" has no specific mitigation, only a class`);
    }
    if (score(row) >= signalThreshold && !row.signal) {
      violations.push(
        `"${row.failure}" scores ${score(row)} with no signal: build the signal, that is the work`,
      );
    }
    if (row.silent && row.blindness <= 2) {
      warnings.push(`"${row.failure}" is marked silent but scored easy to spot, check one of the two`);
    }
  }

  const silent = silentShare(rows);
  if (rows.length > 0 && silent < minSilentShare) {
    warnings.push(
      `only ${Math.round(silent * 100)} percent of rows are silent failures: you may have mapped your web server, not your LLM feature`,
    );
  }

  return { ok: violations.length === 0, violations, warnings, top: rank(rows).slice(0, 3) };
}
