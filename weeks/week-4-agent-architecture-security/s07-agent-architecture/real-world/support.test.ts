import { describe, it, expect } from "vitest";
import type { ToolContext } from "../tools/tool.ts";
import type { Action, Policy } from "../loop/agent.ts";
import { createSupportDeps, handleTicket } from "./support.ts";

const acme: ToolContext = { tenantId: "acme", userId: "u-1" };

/** A scripted policy stands in for the model, so these tests are deterministic. */
function scripted(actions: Action[]): Policy {
  let i = 0;
  return async () => ({ action: actions[i++] ?? { kind: "final", text: "out of script" }, costUsd: 0.002 });
}

/** What a well-behaved run looks like: look it up, read the rules, then act. */
function refundScript(orderId: string): Action[] {
  return [
    { kind: "tools", calls: [{ name: "lookup_order", args: { orderId } }] },
    { kind: "tools", calls: [{ name: "read_refund_policy", args: {} }] },
    { kind: "tools", calls: [{ name: "issue_refund", args: { orderId, reason: "damaged" } }] },
    { kind: "final", text: "Refunded, sorry about that." },
  ];
}

describe("support agent", () => {
  it("refunds a small, recent order and stops", async () => {
    const deps = createSupportDeps();
    const run = await handleTicket("o-1001 arrived broken", scripted(refundScript("o-1001")), deps, acme);

    expect(run.stopReason).toBe("done");
    expect(run.toolCalls).toBe(3);
    expect(deps.refunded.get("o-1001")).toBe("rf-o-1001");
  });

  it("refuses an over-limit refund in the TOOL, whatever the model asked for", async () => {
    const deps = createSupportDeps();
    // The model is confident and polite and completely wrong: GBP 950 is over the cap.
    const run = await handleTicket("refund o-2002 please", scripted(refundScript("o-2002")), deps, acme);

    expect(deps.refunded.has("o-2002")).toBe(false);
    const observations = run.history.filter((e) => e.role === "observation");
    expect(observations.at(-1)).toMatchObject({ name: "issue_refund" });
    expect(JSON.stringify(observations.at(-1))).toContain("over the GBP 100 automatic limit");
  });

  it("refuses a refund outside the time window, for the same reason", async () => {
    const deps = createSupportDeps();
    await handleTicket("refund o-3003", scripted(refundScript("o-3003")), deps, acme);
    expect(deps.refunded.has("o-3003")).toBe(false);
  });

  it("will not touch another tenant's order, even by exact id", async () => {
    const deps = createSupportDeps();
    const run = await handleTicket("refund o-4004", scripted(refundScript("o-4004")), deps, acme);

    expect(deps.refunded.has("o-4004")).toBe(false);
    expect(JSON.stringify(run.history)).toContain("no order o-4004 on this account");
  });

  it("processes the same ticket twice without refunding twice", async () => {
    const deps = createSupportDeps();
    await handleTicket("o-1001 arrived broken", scripted(refundScript("o-1001")), deps, acme);
    const replay = await handleTicket("o-1001 arrived broken", scripted(refundScript("o-1001")), deps, acme);

    expect(deps.refunded.size).toBe(1);
    expect(JSON.stringify(replay.history)).toContain("already refunded");
  });

  it("stops a policy that never finishes, without refunding anything", async () => {
    const deps = createSupportDeps();
    let n = 0;
    const runaway: Policy = async () => ({
      action: { kind: "tools", calls: [{ name: "lookup_order", args: { orderId: `o-100${n++}` } }] },
      costUsd: 0.002,
    });

    const run = await handleTicket("hello", runaway, deps, acme, { maxSteps: 4 });

    expect(run.stopReason).toBe("step_cap");
    expect(deps.refunded.size).toBe(0);
  });

  it("recovers when the model invents a tool that does not exist", async () => {
    const deps = createSupportDeps();
    const policy = scripted([
      { kind: "tools", calls: [{ name: "run_sql", args: { query: "select * from orders" } }] },
      ...refundScript("o-1001"),
    ]);

    const run = await handleTicket("o-1001 arrived broken", policy, deps, acme, { maxSteps: 8 });

    const rejected = run.history.find((e) => e.role === "observation" && e.name === "run_sql");
    expect(rejected).toMatchObject({ ok: false });
    expect((rejected as { text: string }).text).toContain('no tool named "run_sql"');
    expect(run.stopReason).toBe("done"); // the bad guess cost one step, not the run
    expect(deps.refunded.get("o-1001")).toBe("rf-o-1001");
  });
});
