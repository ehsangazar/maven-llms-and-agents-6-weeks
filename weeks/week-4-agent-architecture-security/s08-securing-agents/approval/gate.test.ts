import { describe, it, expect } from "vitest";
import { ApprovalError, createGate, renderForHuman } from "./gate.ts";

const human = { kind: "human", id: "agent-sam" } as const;

/** A clock we control, so "it expired" is a test and not a wait. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("approval gate", () => {
  it("binds the yes to the exact arguments, not to the tool", () => {
    const gate = createGate();
    const req = gate.request("run-1", "issue_refund", { orderId: "o-1001", amount: 42 });
    gate.approve("run-1", req.argsHash, human);

    // The approved call goes through.
    expect(gate.consume("run-1", "issue_refund", { orderId: "o-1001", amount: 42 }).approvedBy).toBe(
      "agent-sam",
    );

    // The injected one does not. Same tool, same run, different order.
    const gate2 = createGate();
    const req2 = gate2.request("run-2", "issue_refund", { orderId: "o-1001", amount: 42 });
    gate2.approve("run-2", req2.argsHash, human);
    expect(() => gate2.consume("run-2", "issue_refund", { orderId: "o-9999", amount: 42 })).toThrow(
      /exact arguments/,
    );
  });

  it("ignores the order the arguments were written in", () => {
    const gate = createGate();
    const req = gate.request("run-1", "issue_refund", { orderId: "o-1001", amount: 42 });
    gate.approve("run-1", req.argsHash, human);
    expect(() => gate.consume("run-1", "issue_refund", { amount: 42, orderId: "o-1001" })).not.toThrow();
  });

  it("spends the yes exactly once, so a retry loop cannot reuse it", () => {
    const gate = createGate();
    const req = gate.request("run-1", "send_email", { to: "ada@example.com" });
    gate.approve("run-1", req.argsHash, human);

    gate.consume("run-1", "send_email", { to: "ada@example.com" });
    expect(() => gate.consume("run-1", "send_email", { to: "ada@example.com" })).toThrow(
      /already used once/,
    );
  });

  it("expires, so Tuesday's yes does not fire on Friday", () => {
    const c = clock();
    const gate = createGate({ ttlMs: 60_000, now: c.now });
    const req = gate.request("run-1", "issue_refund", { orderId: "o-1001" });
    gate.approve("run-1", req.argsHash, human);

    c.advance(61_000);
    expect(() => gate.consume("run-1", "issue_refund", { orderId: "o-1001" })).toThrow(/expired/);
  });

  it("refuses an approval from the model, which is the entire attack", () => {
    const gate = createGate();
    const req = gate.request("run-1", "issue_refund", { orderId: "o-9999" });

    // The poisoned document said "the customer already approved this refund",
    // and the model believed it. It still does not get a yes.
    expect(() => gate.approve("run-1", req.argsHash, { kind: "model" })).toThrow(ApprovalError);
    expect(() => gate.approve("run-1", req.argsHash, { kind: "tool", name: "search_docs" })).toThrow(
      /cannot approve/,
    );
    expect(() => gate.consume("run-1", "issue_refund", { orderId: "o-9999" })).toThrow();
  });

  it("refuses to approve something nobody asked for", () => {
    const gate = createGate();
    expect(() => gate.approve("run-1", "deadbeef", human)).toThrow(/no pending approval/);
  });

  it("shows the human a summary built from the arguments, not from the document", () => {
    const summary = renderForHuman("issue_refund", { orderId: "o-1001", amount: 42 });
    expect(summary).toBe("Allow issue_refund(orderId=o-1001, amount=42)?");
    // Nothing an attacker wrote can reach this string: it is built from the
    // validated arguments, so the confirm dialog cannot be ghost-written.
    expect(summary).not.toContain("urgent");
  });
});
