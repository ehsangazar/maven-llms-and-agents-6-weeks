/**
 * S10 · prompt versioning that a trace can actually trust.
 *
 * A hand-bumped version number lies the moment someone edits a prompt without
 * bumping it, and then every trace from that day claims a version that never ran.
 * The id is derived from the content, so it cannot disagree with what was sent.
 */
import { createHash } from "node:crypto";

export interface Prompt {
  name: string;
  template: string;
  /** name@<content hash>. Derived, never typed by a human. */
  id: string;
}

/** Short content hash. Six hex characters is plenty to tell two prompts apart. */
export function fingerprint(template: string): string {
  return createHash("sha256").update(template).digest("hex").slice(0, 6);
}

export function definePrompt(name: string, template: string): Prompt {
  return { name, template, id: `${name}@${fingerprint(template)}` };
}

export class PromptRegistry {
  private readonly byId = new Map<string, Prompt>();

  register(name: string, template: string): Prompt {
    const prompt = definePrompt(name, template);
    this.byId.set(prompt.id, prompt);
    return prompt;
  }

  /**
   * Resolve the exact text a trace ran. This is the whole point: six months
   * later, "answer@e7aa2e" still returns the bytes the model was given.
   */
  get(id: string): Prompt | undefined {
    return this.byId.get(id);
  }

  /** Every version of one prompt, for a v-to-v comparison on the golden set. */
  versionsOf(name: string): Prompt[] {
    return [...this.byId.values()].filter((p) => p.name === name);
  }
}

export interface VersionScore {
  id: string;
  passRate: number;
  costPerRequestUsd: number;
  latencyP95: number;
}

export interface PromoteVerdict {
  promote: boolean;
  reasons: string[];
}

/**
 * The promotion gate. S9 ruled that an average going up is a release note, not a
 * decision. Same rule here: a new prompt has to win on quality without quietly
 * losing on cost or on the tail.
 */
export function shouldPromote(
  candidate: VersionScore,
  incumbent: VersionScore,
  tolerance = { minQualityGain: 0.02, maxCostIncrease: 1.1, maxLatencyIncrease: 1.1 },
): PromoteVerdict {
  const reasons: string[] = [];

  if (candidate.passRate < incumbent.passRate + tolerance.minQualityGain) {
    reasons.push(
      `quality: ${candidate.passRate.toFixed(2)} vs ${incumbent.passRate.toFixed(2)}, inside the noise`,
    );
  }
  if (candidate.costPerRequestUsd > incumbent.costPerRequestUsd * tolerance.maxCostIncrease) {
    reasons.push(`cost: the longer prompt costs more on every request, forever`);
  }
  if (candidate.latencyP95 > incumbent.latencyP95 * tolerance.maxLatencyIncrease) {
    reasons.push(`latency: p95 got worse, and users feel the tail`);
  }

  return { promote: reasons.length === 0, reasons };
}
