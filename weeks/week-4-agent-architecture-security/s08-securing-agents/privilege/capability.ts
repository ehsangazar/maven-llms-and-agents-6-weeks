/**
 * S8 · least privilege, as something the run actually carries.
 *
 * "Least privilege" is usually a slogan. Here it is an object.
 *
 * A run starts with a set of CAPABILITIES: the exact tools it may call, scoped
 * to the exact things it may touch. Three properties make it a defence rather
 * than a comment:
 *
 *   1. Capabilities come from the USER's permissions, not the service account.
 *      Otherwise you have a confused deputy: the agent has more rights than the
 *      person asking, and injection borrows the difference.
 *   2. They are SCOPED. A capability to refund is a capability to refund
 *      order o-1001. A payload saying "refund o-9999" is denied by arithmetic,
 *      not by the model's good judgement.
 *   3. They only ever SHRINK. And the moment untrusted content enters the run,
 *      the dangerous ones are dropped automatically.
 *
 * Point three is the interesting one. It is the "lethal trifecta" written as
 * code: private data, plus untrusted content, plus a way to act outward, is the
 * combination that turns a nuisance into a breach. Remove any one leg and the
 * attack does not complete. So when leg two arrives, we remove leg three.
 */

export type Effect = "read" | "write" | "irreversible";

export interface Capability {
  tool: string;
  effect: Effect;
  /** Exact values this capability is good for: { orderId: "o-1001" }. */
  scope?: Readonly<Record<string, string>>;
}

export interface Grantable {
  /** What the signed-in human may do. The ceiling for everything below. */
  userPermissions: readonly string[];
}

export interface RunPrivileges {
  readonly tenantId: string;
  readonly userId: string;
  readonly capabilities: readonly Capability[];
  /** True once any untrusted content has entered this run. */
  readonly tainted: boolean;
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

/**
 * Build the starting set. Anything the user cannot do themselves is silently
 * absent, never "requested and denied later": the model should not even be told
 * the tool exists.
 */
export function grant(
  identity: { tenantId: string; userId: string },
  requested: readonly Capability[],
  user: Grantable,
): RunPrivileges {
  const capabilities = requested.filter((cap) => user.userPermissions.includes(cap.tool));
  return { ...identity, capabilities, tainted: false };
}

/** Capabilities only ever shrink. There is no `widen`, and that is the design. */
export function narrow(privileges: RunPrivileges, keep: (cap: Capability) => boolean): RunPrivileges {
  return { ...privileges, capabilities: privileges.capabilities.filter(keep) };
}

/**
 * Untrusted content just entered the run. Drop everything that can change the
 * world, and mark the run so a human can see why it stopped short.
 *
 * This is the single highest-value line in the folder. After it runs, a
 * successful injection can still make the model say something wrong. It can no
 * longer make it DO something wrong.
 */
export function taint(privileges: RunPrivileges): RunPrivileges {
  return {
    ...narrow(privileges, (cap) => cap.effect === "read"),
    tainted: true,
  };
}

/** May this run call this tool, with these arguments, right now? */
export function canCall(
  privileges: RunPrivileges,
  tool: string,
  args: Readonly<Record<string, unknown>> = {},
): Decision {
  const cap = privileges.capabilities.find((c) => c.tool === tool);

  if (!cap) {
    return {
      allowed: false,
      reason: privileges.tainted
        ? `no capability for "${tool}": dropped when untrusted content entered this run`
        : `no capability for "${tool}" in this run`,
    };
  }

  for (const [key, value] of Object.entries(cap.scope ?? {})) {
    const supplied = args[key];
    if (supplied === undefined) {
      return { allowed: false, reason: `${tool} is scoped to ${key}=${value}, but no ${key} was given` };
    }
    if (String(supplied) !== value) {
      // The payload said o-9999. The capability says o-1001. No judgement call.
      return { allowed: false, reason: `${tool} is scoped to ${key}=${value}, not ${String(supplied)}` };
    }
  }

  return { allowed: true, reason: `${tool} is in scope for this run` };
}

/**
 * The lethal trifecta, as a check you can run on a design.
 *
 * All three legs present is the shape of every serious agent breach. You do not
 * have to remove the risk. You do have to notice you have it.
 */
export interface TrifectaInput {
  /** Can the run read anything the user could not publish themselves? */
  privateData: boolean;
  /** Does any content the run reads come from outside your trust boundary? */
  untrustedContent: boolean;
  /** Can the run send anything outward: email, HTTP, a rendered link? */
  externalCommunication: boolean;
}

export interface TrifectaVerdict {
  exposed: boolean;
  legs: string[];
  advice: string;
}

export function lethalTrifecta(input: TrifectaInput): TrifectaVerdict {
  const legs: string[] = [];
  if (input.privateData) legs.push("private data");
  if (input.untrustedContent) legs.push("untrusted content");
  if (input.externalCommunication) legs.push("external communication");

  if (legs.length < 3) {
    return {
      exposed: false,
      legs,
      advice: `only ${legs.length} of 3 legs present, so the exfiltration path does not close`,
    };
  }

  return {
    exposed: true,
    legs,
    advice:
      "all three legs present. Break one: drop write capabilities once untrusted content " +
      "enters (see taint), or allow-list every outbound destination (see ../egress).",
  };
}
