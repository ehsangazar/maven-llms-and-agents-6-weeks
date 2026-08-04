import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createRegistry, defineTool, type ToolContext } from "./tool.ts";

const ctx: ToolContext = { tenantId: "acme", userId: "u-1" };

const lookupOrder = defineTool({
  name: "lookup_order",
  description: "Look up one order the current user owns, by order id.",
  effect: "read",
  schema: z.object({ orderId: z.string().min(3) }),
  run: async ({ orderId }) => `order ${orderId}: shipped, GBP 42.00`,
});

const issueRefund = defineTool({
  name: "issue_refund",
  description: "Refund one order the current user owns. Money moves.",
  effect: "irreversible",
  schema: z.object({
    orderId: z.string().min(3),
    reason: z.enum(["damaged", "late", "wrong_item"]),
  }),
  run: async ({ orderId, reason }) => `refunded ${orderId} (${reason})`,
});

describe("defineTool", () => {
  it("refuses a name the model cannot type reliably", () => {
    const bad = { description: "does a thing well", effect: "read" as const, schema: z.object({}), run: async () => "" };
    expect(() => defineTool({ ...bad, name: "Lookup Order" })).toThrow();
    expect(() => defineTool({ ...bad, name: "go" })).toThrow();
    expect(() => defineTool({ ...bad, name: "lookup_order" })).not.toThrow();
  });

  it("refuses a tool with no real description, because that is all the model reads", () => {
    expect(() =>
      defineTool({
        name: "do_thing",
        description: "does",
        effect: "read",
        schema: z.object({}),
        run: async () => "",
      }),
    ).toThrow();
  });

  it("publishes the argument shape the model will be shown", () => {
    expect(issueRefund.jsonSchema).toEqual({
      type: "object",
      properties: {
        orderId: { type: "string" },
        reason: { type: "string", enum: ["damaged", "late", "wrong_item"] },
      },
      required: ["orderId", "reason"],
    });
  });
});

describe("registry", () => {
  it("is the allow-list: an unknown tool comes back as a recoverable message", async () => {
    const registry = createRegistry([lookupOrder, issueRefund]);
    const result = await registry.call("run_sql", { query: "select 1" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.observation).toContain("no tool named");
    // Tell it what DOES exist, or it will guess again next step.
    expect(result.observation).toContain("lookup_order");
  });

  it("rejects invalid arguments with a message the model can act on", async () => {
    const registry = createRegistry([issueRefund]);
    const result = await registry.call("issue_refund", { orderId: "o-1", reason: "bored" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.observation).toContain("reason");
  });

  it("turns a thrown tool into an observation instead of ending the run", async () => {
    const flaky = defineTool({
      name: "search_logs",
      description: "Search the application logs for a phrase.",
      effect: "read",
      schema: z.object({ q: z.string() }),
      run: async () => {
        throw new Error("log backend timed out");
      },
    });
    const registry = createRegistry([flaky]);
    const result = await registry.call("search_logs", { q: "500" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.observation).toContain("log backend timed out");
  });

  it("bounds a huge result, and admits that it did", async () => {
    const chatty = defineTool({
      name: "dump_table",
      description: "Return every row, which is exactly the problem.",
      effect: "read",
      maxChars: 100,
      schema: z.object({}),
      run: async () => "x".repeat(5000),
    });
    const registry = createRegistry([chatty]);
    const result = await registry.call("dump_table", {}, ctx);

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.observation).toContain("[truncated: 4900 more characters]");
  });

  it("keeps the catalogue sorted, so the cached prompt prefix stays stable", () => {
    const a = createRegistry([issueRefund, lookupOrder]).catalogue();
    const b = createRegistry([lookupOrder, issueRefund]).catalogue();
    expect(a).toEqual(b);
    expect(a.map((t) => t.name)).toEqual(["issue_refund", "lookup_order"]);
  });

  it("carries the effect through, because durability is decided by it", async () => {
    const registry = createRegistry([lookupOrder, issueRefund]);
    const read = await registry.call("lookup_order", { orderId: "o-1" }, ctx);
    const money = await registry.call("issue_refund", { orderId: "o-1", reason: "late" }, ctx);

    expect(read.effect).toBe("read");
    expect(money.effect).toBe("irreversible");
  });

  it("passes the caller identity from code, never from the model", async () => {
    let seen: ToolContext | undefined;
    const whoami = defineTool({
      name: "whoami",
      description: "Return the identity the tool was invoked with.",
      effect: "read",
      schema: z.object({ tenantId: z.string().optional() }),
      run: async (_args, c) => {
        seen = c;
        return c.tenantId;
      },
    });
    const registry = createRegistry([whoami]);
    // The model tries to claim a different tenant in its arguments.
    const result = await registry.call("whoami", { tenantId: "globex" }, ctx);

    expect(seen).toEqual(ctx);
    expect(result.observation).toBe("acme");
  });
});
