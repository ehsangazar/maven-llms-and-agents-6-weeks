import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createRegistry, defineTool, type ToolContext } from "../tools/tool.ts";
import { runAgent, type Action, type Policy } from "./agent.ts";

const ctx: ToolContext = { tenantId: "acme", userId: "u-1" };

const lookupOrder = defineTool({
  name: "lookup_order",
  description: "Look up one order the current user owns, by order id.",
  effect: "read",
  schema: z.object({ orderId: z.string() }),
  run: async ({ orderId }) => `order ${orderId}: shipped`,
});

/** A policy that reads from a fixed script. No model, no key, no flakiness. */
function scripted(actions: Action[], costPerStep = 0): Policy {
  let i = 0;
  return async () => {
    const action = actions[i++] ?? { kind: "final", text: "out of script" };
    return { action, costUsd: costPerStep };
  };
}

describe("runAgent", () => {
  it("runs a tool, feeds the observation back, and finishes", async () => {
    const registry = createRegistry([lookupOrder]);
    const policy = scripted([
      { kind: "tools", calls: [{ name: "lookup_order", args: { orderId: "o-1" } }] },
      { kind: "final", text: "It shipped." },
    ]);

    const run = await runAgent("where is o-1?", policy, registry, ctx);

    expect(run.stopReason).toBe("done");
    expect(run.answer).toBe("It shipped.");
    expect(run.steps).toBe(2);
    expect(run.toolCalls).toBe(1);
    // The observation is in the history, which is what the next turn reads.
    expect(run.history.some((e) => e.role === "observation" && e.text.includes("shipped"))).toBe(true);
  });

  it("stops at the step cap instead of looping forever", async () => {
    const registry = createRegistry([lookupOrder]);
    // A policy that never finishes, and never repeats itself either.
    let n = 0;
    const policy: Policy = async () => ({
      action: { kind: "tools", calls: [{ name: "lookup_order", args: { orderId: `o-${n++}` } }] },
    });

    const run = await runAgent("go", policy, registry, ctx, { maxSteps: 4 });

    expect(run.stopReason).toBe("step_cap");
    expect(run.steps).toBe(4);
    expect(run.toolCalls).toBe(4);
  });

  it("stops on the budget before it makes the next call, not after", async () => {
    const registry = createRegistry([lookupOrder]);
    let n = 0;
    const policy: Policy = async () => ({
      action: { kind: "tools", calls: [{ name: "lookup_order", args: { orderId: `o-${n++}` } }] },
      costUsd: 0.04,
    });

    const run = await runAgent("go", policy, registry, ctx, { maxSteps: 50, budgetUsd: 0.1 });

    expect(run.stopReason).toBe("budget");
    expect(run.spentUsd).toBeCloseTo(0.12, 5); // three calls, then it refuses a fourth
    expect(run.steps).toBe(3);
  });

  it("catches the model spinning on the same call, before the step cap does", async () => {
    const registry = createRegistry([lookupOrder]);
    const policy: Policy = async () => ({
      action: { kind: "tools", calls: [{ name: "lookup_order", args: { orderId: "o-1" } }] },
    });

    const run = await runAgent("go", policy, registry, ctx, { maxSteps: 50, repeatLimit: 3 });

    expect(run.stopReason).toBe("no_progress");
    expect(run.answer).toContain("same arguments");
    expect(run.toolCalls).toBeLessThan(5);
  });

  it("treats argument order as irrelevant when spotting a repeat", async () => {
    const two = defineTool({
      name: "search",
      description: "Search the catalogue with a query and a limit.",
      effect: "read",
      schema: z.object({ q: z.string(), limit: z.number() }),
      run: async () => "no results",
    });
    const registry = createRegistry([two]);
    const policy = scripted([
      { kind: "tools", calls: [{ name: "search", args: { q: "a", limit: 5 } }] },
      { kind: "tools", calls: [{ name: "search", args: { limit: 5, q: "a" } }] },
      { kind: "tools", calls: [{ name: "search", args: { q: "a", limit: 5 } }] },
    ]);

    const run = await runAgent("go", policy, registry, ctx, { maxSteps: 10 });
    expect(run.stopReason).toBe("no_progress");
  });

  it("runs independent calls in one step together, not one after another", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = defineTool({
      name: "fetch_thing",
      description: "Fetch one thing, slowly, from somewhere far away.",
      effect: "read",
      schema: z.object({ id: z.string() }),
      run: async ({ id }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return `thing ${id}`;
      },
    });
    const registry = createRegistry([slow]);
    const policy = scripted([
      {
        kind: "tools",
        calls: [
          { name: "fetch_thing", args: { id: "a" } },
          { name: "fetch_thing", args: { id: "b" } },
          { name: "fetch_thing", args: { id: "c" } },
        ],
      },
      { kind: "final", text: "got them" },
    ]);

    const run = await runAgent("go", policy, registry, ctx);

    expect(peak).toBe(3); // all three were in flight at once
    expect(run.toolCalls).toBe(3);
  });

  it("survives a tool that fails, and lets the next turn react to it", async () => {
    const broken = defineTool({
      name: "check_stock",
      description: "Check whether an item is in stock right now.",
      effect: "read",
      schema: z.object({ sku: z.string() }),
      run: async () => {
        throw new Error("inventory service is down");
      },
    });
    const registry = createRegistry([broken]);

    const seenFailure: boolean[] = [];
    const policy: Policy = async (history) => {
      const failed = history.some((e) => e.role === "observation" && !e.ok);
      seenFailure.push(failed);
      if (failed) return { action: { kind: "final", text: "I could not check stock right now." } };
      return { action: { kind: "tools", calls: [{ name: "check_stock", args: { sku: "s-1" } }] } };
    };

    const run = await runAgent("in stock?", policy, registry, ctx);

    expect(run.stopReason).toBe("done");
    expect(seenFailure).toEqual([false, true]); // the failure reached the next turn
    expect(run.answer).toContain("could not check");
  });
});
