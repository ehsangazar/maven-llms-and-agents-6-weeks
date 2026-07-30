/**
 * S6 real-world · the investigator's worst failure, and the check that catches it.
 *
 * S5 built a production bug investigator. This is its failure-mode map made
 * executable, and it is a good example precisely because the expensive failure
 * is the silent one:
 *
 *   LOUD    the log backend is down. Everyone can see it, the ladder handles it,
 *           and on-call knows they are working with less.
 *   SILENT  the investigator names a plausible cause that nothing supports.
 *           Nothing throws. Latency is fine. On-call spends forty minutes on the
 *           wrong service while the real outage continues.
 *
 * So the blast radius of this tool is measured in minutes added to an incident,
 * and the mitigation is not a better prompt. It is refusing to pass on a cause
 * whose evidence does not appear in the context you actually retrieved.
 */

import type { Deploy, LogLine } from "./incident.ts";

export interface Hypothesis {
  cause: string;
  evidence: string[];
  confident: boolean;
  nextAction: string;
}

/** What the investigator was actually given. Anything outside this is invention. */
export interface Context {
  logs: LogLine[];
  deploys: Deploy[];
}

export type GroundingVerdict =
  | { status: "grounded"; supported: string[] }
  | { status: "unsupported"; supported: string[]; invented: string[] }
  | { status: "no-evidence" };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Does every quoted piece of evidence actually appear in the retrieved context?
 *
 * Deliberately dumb: substring matching over what you retrieved. A cleverer
 * check would be another model call, which is another thing that can be
 * confidently wrong, and this is the layer that is supposed to stop that.
 */
export function checkGrounding(hypothesis: Hypothesis, context: Context): GroundingVerdict {
  if (hypothesis.evidence.length === 0) return { status: "no-evidence" };

  const haystack = [
    ...context.logs.map((l) => `${l.at} ${l.service} ${l.level} ${l.message}`),
    ...context.deploys.map((d) => `${d.at} ${d.service} ${d.version} ${d.summary}`),
  ].map(norm);

  const supported: string[] = [];
  const invented: string[] = [];
  for (const quote of hypothesis.evidence) {
    const needle = norm(quote);
    if (needle.length > 0 && haystack.some((line) => line.includes(needle))) supported.push(quote);
    else invented.push(quote);
  }

  if (invented.length > 0) return { status: "unsupported", supported, invented };
  return { status: "grounded", supported };
}

export interface Handover {
  /** What on-call is told. */
  message: string;
  /** True when the investigator is passing on a cause rather than a dead end. */
  actionable: boolean;
  verdict: GroundingVerdict;
}

/**
 * What on-call actually receives. An ungrounded hypothesis is downgraded to the
 * honest version rather than dropped: the checks it ran are still useful, and
 * "I looked at these three things and found nothing" is a real contribution at
 * 3am. It is the confident wrong answer that is not.
 */
export function handOver(
  hypothesis: Hypothesis | null,
  context: Context,
  checksRun: string[],
): Handover {
  if (!hypothesis) {
    return {
      message: `No hypothesis. Checked: ${checksRun.join(", ") || "nothing"}.`,
      actionable: false,
      verdict: { status: "no-evidence" },
    };
  }

  const verdict = checkGrounding(hypothesis, context);

  if (verdict.status === "grounded") {
    return {
      message: `${hypothesis.cause}\nEvidence: ${verdict.supported.join(" | ")}\nNext: ${hypothesis.nextAction}`,
      actionable: true,
      verdict,
    };
  }

  const invented = verdict.status === "unsupported" ? verdict.invented : [];
  return {
    message:
      `No supported cause. Checked: ${checksRun.join(", ") || "nothing"}.` +
      (invented.length > 0 ? `\nDiscarded (not in the retrieved context): ${invented.join(" | ")}` : ""),
    actionable: false,
    verdict,
  };
}

/**
 * The metric this failure mode needs, and the reason the map asks for one.
 *
 * You cannot measure "was the investigator right" without waiting for the
 * postmortem. You CAN measure how often it passed on a cause it could not cite,
 * continuously, and that is the signal that moves before anyone notices.
 */
export interface GroundingStats {
  total: number;
  grounded: number;
  unsupported: number;
  noEvidence: number;
}

export function tally(verdicts: GroundingVerdict[]): GroundingStats & { ungroundedRate: number } {
  const stats: GroundingStats = { total: verdicts.length, grounded: 0, unsupported: 0, noEvidence: 0 };
  for (const v of verdicts) {
    if (v.status === "grounded") stats.grounded++;
    else if (v.status === "unsupported") stats.unsupported++;
    else stats.noEvidence++;
  }
  const ungrounded = stats.unsupported + stats.noEvidence;
  return { ...stats, ungroundedRate: stats.total === 0 ? 0 : ungrounded / stats.total };
}
