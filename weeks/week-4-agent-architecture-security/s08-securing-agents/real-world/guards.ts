/**
 * S8 real-world example, the two guards that stop the two different attacks.
 *
 *  1. A poisoned DOCUMENT (indirect injection): untrusted text arrives as a tool
 *     result and tries to issue instructions. Defense: it never carries
 *     authority, and any write needs an approval no document can grant.
 *  2. A poisoned TOOL (supply chain): the attack rides in a tool description
 *     from a rogue server. You cannot filter your way out once the model sees
 *     it, so you allow-list which servers may load at all, upstream.
 *
 * All three guards here are pure functions: no model, no key, fully testable.
 */
export interface ToolSpec {
  name: string;
  server: string;
}

/** Supply-chain guard: only tools from allow-listed servers are admitted. */
export function admitTools(
  requested: ToolSpec[],
  allowedServers: string[],
): { admitted: ToolSpec[]; blocked: ToolSpec[] } {
  const admitted: ToolSpec[] = [];
  const blocked: ToolSpec[] = [];
  for (const tool of requested) {
    (allowedServers.includes(tool.server) ? admitted : blocked).push(tool);
  }
  return { admitted, blocked };
}

export class ApprovalRequired extends Error {}

/** Write guard: a side-effecting action proceeds only with explicit approval. */
export function performWrite(action: string, approvedActions: ReadonlySet<string>): string {
  if (!approvedActions.has(action)) {
    throw new ApprovalRequired(`write "${action}" needs approval`);
  }
  return `performed: ${action}`;
}

/** Trust-boundary wrapper: retrieved content is data, never instructions. */
export function asData(retrieved: string): string {
  return `<retrieved>\n${retrieved}\n</retrieved>`;
}
