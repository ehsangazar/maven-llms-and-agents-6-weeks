/**
 * S7 real-world · an order support agent, assembled from this session's parts.
 *
 * The job: a customer writes in about an order. The agent looks the order up,
 * reads the refund policy, and either refunds it or explains why it cannot.
 *
 * It is the right job for this session because every architecture choice shows
 * up in it:
 *
 *   - three tools, each narrow, each declaring its effect
 *   - a rule the SERVER enforces (the refund cap), not the prompt
 *   - a run that can be retried without refunding the same order twice
 *   - a loop with a step cap and a budget
 *
 * The interesting test is not the happy path. It is what happens when the model
 * asks for something it is not allowed to have, and when the same ticket is
 * processed twice.
 */
import { z } from "zod";
import { createRegistry, defineTool, type Registry, type ToolContext } from "../tools/tool.ts";
import { runAgent, type AgentRun, type Policy } from "../loop/agent.ts";

export interface Order {
  id: string;
  tenantId: string;
  totalGbp: number;
  status: "shipped" | "delivered" | "cancelled";
  deliveredDaysAgo?: number;
}

export interface SupportDeps {
  orders: Record<string, Order>;
  /** Refunds already issued, keyed by order id. This is the idempotency store. */
  refunded: Map<string, string>;
  /** Server-side policy. The prompt does not get a vote on these. */
  maxAutoRefundGbp: number;
  maxDaysSinceDelivery: number;
}

export function createSupportDeps(overrides: Partial<SupportDeps> = {}): SupportDeps {
  return {
    orders: {
      "o-1001": { id: "o-1001", tenantId: "acme", totalGbp: 42, status: "delivered", deliveredDaysAgo: 3 },
      "o-2002": { id: "o-2002", tenantId: "acme", totalGbp: 950, status: "delivered", deliveredDaysAgo: 2 },
      "o-3003": { id: "o-3003", tenantId: "acme", totalGbp: 25, status: "delivered", deliveredDaysAgo: 400 },
      "o-4004": { id: "o-4004", tenantId: "globex", totalGbp: 30, status: "delivered", deliveredDaysAgo: 1 },
    },
    refunded: new Map(),
    maxAutoRefundGbp: 100,
    maxDaysSinceDelivery: 30,
    ...overrides,
  };
}

/**
 * Three tools. Notice what is NOT here: no `run_sql`, no `http_get`, no
 * `update_order(fields)`. Each tool is one verb with a typed argument, and the
 * scary one re-checks the rules itself.
 */
export function createSupportRegistry(deps: SupportDeps): Registry {
  const lookupOrder = defineTool({
    name: "lookup_order",
    description:
      "Look up one order by id. Returns its total in GBP, its status, and how many days ago it was delivered.",
    effect: "read",
    schema: z.object({ orderId: z.string().min(3) }),
    run: async ({ orderId }, ctx) => {
      const order = deps.orders[orderId];
      // The tenant check is here, in code, using the identity the CALLER passed
      // in. Not a sentence in the system prompt asking the model to be careful.
      if (!order || order.tenantId !== ctx.tenantId) return `no order ${orderId} on this account`;
      return `order ${order.id}: GBP ${order.totalGbp.toFixed(2)}, ${order.status}, delivered ${order.deliveredDaysAgo ?? "n/a"} days ago`;
    },
  });

  const refundPolicy = defineTool({
    name: "read_refund_policy",
    description:
      "Read the refund policy: the automatic refund limit in GBP and the window in days since delivery.",
    effect: "read",
    schema: z.object({}),
    run: async () =>
      `auto-refund up to GBP ${deps.maxAutoRefundGbp}, within ${deps.maxDaysSinceDelivery} days of delivery. Anything else needs a human.`,
  });

  const issueRefund = defineTool({
    name: "issue_refund",
    description:
      "Refund one order in full. Only works inside the refund policy. Money leaves the account, so use it once.",
    effect: "irreversible",
    schema: z.object({
      orderId: z.string().min(3),
      reason: z.enum(["damaged", "late", "wrong_item", "changed_mind"]),
    }),
    run: async ({ orderId, reason }, ctx) => {
      const order = deps.orders[orderId];
      if (!order || order.tenantId !== ctx.tenantId) return `refused: no order ${orderId} on this account`;

      // Idempotency: the same order refunded twice returns the first receipt.
      // This is what makes a retried ticket safe (Session 5's rule, load-bearing here).
      const existing = deps.refunded.get(orderId);
      if (existing) return `already refunded: ${existing}`;

      // The policy is re-checked HERE. The model asked; the server decides.
      if (order.totalGbp > deps.maxAutoRefundGbp) {
        return `refused: GBP ${order.totalGbp.toFixed(2)} is over the GBP ${deps.maxAutoRefundGbp} automatic limit. Escalate to a human.`;
      }
      if ((order.deliveredDaysAgo ?? Infinity) > deps.maxDaysSinceDelivery) {
        return `refused: delivered ${order.deliveredDaysAgo} days ago, outside the ${deps.maxDaysSinceDelivery} day window.`;
      }

      const receipt = `rf-${orderId}`;
      deps.refunded.set(orderId, receipt);
      return `refunded GBP ${order.totalGbp.toFixed(2)} for ${orderId} (${reason}), receipt ${receipt}`;
    },
  });

  return createRegistry([lookupOrder, refundPolicy, issueRefund]);
}

export interface TicketOptions {
  maxSteps?: number;
  budgetUsd?: number;
}

/** The whole path: registry in, bounded loop, one answer out. */
export async function handleTicket(
  message: string,
  policy: Policy,
  deps: SupportDeps,
  ctx: ToolContext,
  options: TicketOptions = {},
): Promise<AgentRun> {
  const registry = createSupportRegistry(deps);
  return runAgent(message, policy, registry, ctx, {
    maxSteps: options.maxSteps ?? 6,
    budgetUsd: options.budgetUsd ?? 0.05,
  });
}

/** The tool catalogue, rendered for a prompt. Handy for the live demo. */
export function describeTools(registry: Registry): string {
  return registry
    .catalogue()
    .map((tool) => `- ${tool.name}${JSON.stringify(tool.parameters.properties ?? {})}: ${tool.description}`)
    .join("\n");
}
