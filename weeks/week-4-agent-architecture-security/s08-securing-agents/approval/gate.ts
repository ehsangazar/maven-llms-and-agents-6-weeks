/**
 * S8 · the approval gate, and the four ways people build it wrong.
 *
 * "A human approves the risky actions" is the defence everybody names and
 * almost nobody implements safely. The four failures, each of which this file
 * turns into a test:
 *
 *   1. Approving the TOOL instead of the CALL. "Refunds are approved" means an
 *      injected refund of a different order sails through. Approval is bound to
 *      the exact arguments.
 *   2. Reusable approvals. One approval, one action. Otherwise a retry loop
 *      spends the same yes ten times.
 *   3. Approvals that never expire. A yes from Tuesday should not fire on
 *      Friday against changed data.
 *   4. Approval that content can grant. If a document saying "the customer has
 *      already approved this" can satisfy your gate, you did not build a gate.
 *      Only a human actor may approve, and the model is never a human actor.
 *
 * There is a fifth, quieter failure: showing the human a summary written by the
 * untrusted content. Then the attacker chooses the words on the confirm dialog.
 * `renderForHuman` builds the prompt from the validated arguments only.
 *
 * The pause and resume machinery this sits on is S7's `durability/checkpoint`.
 * This file is only about whether the yes is real.
 */
import { createHash } from "node:crypto";

export type Actor = { kind: "human"; id: string } | { kind: "model" } | { kind: "tool"; name: string };

export interface PendingApproval {
  runId: string;
  tool: string;
  /** Hash of the exact arguments. Change one character and the yes stops matching. */
  argsHash: string;
  summary: string;
  requestedAtMs: number;
}

export interface GrantedApproval extends PendingApproval {
  approvedBy: string;
  approvedAtMs: number;
  used: boolean;
}

export interface GateOptions {
  /** How long a yes stays good. Default 5 minutes. */
  ttlMs?: number;
  now?: () => number;
}

export function argumentsHash(tool: string, args: unknown): string {
  return createHash("sha256").update(`${tool}:${stable(args)}`).digest("hex").slice(0, 32);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(",")}}`;
}

/**
 * What the human is asked. Built from the tool name and the validated
 * arguments, never from the document that triggered it.
 */
export function renderForHuman(tool: string, args: Readonly<Record<string, unknown>>): string {
  const fields = Object.entries(args)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
  return `Allow ${tool}(${fields})?`;
}

export class ApprovalError extends Error {}

export function createGate(options: GateOptions = {}) {
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const now = options.now ?? Date.now;

  const pending = new Map<string, PendingApproval>();
  const granted = new Map<string, GrantedApproval>();

  return {
    /** Ask. Returns the request so a UI can render it and a human can answer. */
    request(runId: string, tool: string, args: Readonly<Record<string, unknown>>): PendingApproval {
      const req: PendingApproval = {
        runId,
        tool,
        argsHash: argumentsHash(tool, args),
        summary: renderForHuman(tool, args),
        requestedAtMs: now(),
      };
      pending.set(key(runId, req.argsHash), req);
      return req;
    },

    /** Answer. Only a human. A model or a tool saying yes is not a yes. */
    approve(runId: string, argsHash: string, actor: Actor): GrantedApproval {
      if (actor.kind !== "human") {
        // The whole attack, in one line: content persuading the system that
        // permission was already given.
        throw new ApprovalError(
          `approval must come from a human: "${actor.kind}" cannot approve anything`,
        );
      }
      const req = pending.get(key(runId, argsHash));
      if (!req) throw new ApprovalError("no pending approval matches that run and arguments");

      const grantedApproval: GrantedApproval = {
        ...req,
        approvedBy: actor.id,
        approvedAtMs: now(),
        used: false,
      };
      granted.set(key(runId, argsHash), grantedApproval);
      pending.delete(key(runId, argsHash));
      return grantedApproval;
    },

    /**
     * Spend it. Returns the approval and marks it used, or throws with a reason
     * you can show a human. Call this INSIDE the tool, not beside it.
     */
    consume(runId: string, tool: string, args: Readonly<Record<string, unknown>>): GrantedApproval {
      const hash = argumentsHash(tool, args);
      const found = granted.get(key(runId, hash));

      if (!found) {
        throw new ApprovalError(`${tool} was not approved with these exact arguments`);
      }
      if (found.used) {
        throw new ApprovalError(`that approval for ${tool} was already used once`);
      }
      if (now() - found.approvedAtMs > ttlMs) {
        throw new ApprovalError(`the approval for ${tool} expired`);
      }

      found.used = true;
      return found;
    },

    pendingCount: () => pending.size,
  };
}

function key(runId: string, argsHash: string): string {
  return `${runId}|${argsHash}`;
}
