import { describe, it, expect } from "vitest";
import {
  canCall,
  grant,
  lethalTrifecta,
  narrow,
  taint,
  type Capability,
} from "./capability.ts";

const identity = { tenantId: "acme", userId: "u-1" };

const WANTED: Capability[] = [
  { tool: "lookup_order", effect: "read" },
  { tool: "search_docs", effect: "read" },
  { tool: "issue_refund", effect: "irreversible", scope: { orderId: "o-1001" } },
];

describe("grant", () => {
  it("never gives the run more than the human has", () => {
    // The service account can refund. This user cannot. The run must not.
    const privileges = grant(identity, WANTED, {
      userPermissions: ["lookup_order", "search_docs"],
    });

    expect(privileges.capabilities.map((c) => c.tool)).toEqual(["lookup_order", "search_docs"]);
    expect(canCall(privileges, "issue_refund", { orderId: "o-1001" }).allowed).toBe(false);
  });

  it("grants what the human genuinely has", () => {
    const privileges = grant(identity, WANTED, {
      userPermissions: ["lookup_order", "search_docs", "issue_refund"],
    });
    expect(canCall(privileges, "issue_refund", { orderId: "o-1001" })).toEqual({
      allowed: true,
      reason: "issue_refund is in scope for this run",
    });
  });
});

describe("canCall", () => {
  const full = grant(identity, WANTED, {
    userPermissions: ["lookup_order", "search_docs", "issue_refund"],
  });

  it("denies a tool that was never granted, without consulting the model", () => {
    expect(canCall(full, "send_email", {})).toMatchObject({ allowed: false });
  });

  it("denies the injected order id, because the capability is scoped", () => {
    // The poisoned document says: refund o-9999. The capability says o-1001.
    const decision = canCall(full, "issue_refund", { orderId: "o-9999" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("scoped to orderId=o-1001");
  });

  it("denies a scoped call that omits the scoped argument entirely", () => {
    expect(canCall(full, "issue_refund", {}).allowed).toBe(false);
  });
});

describe("taint", () => {
  const full = grant(identity, WANTED, {
    userPermissions: ["lookup_order", "search_docs", "issue_refund"],
  });

  it("drops everything that can act, the moment untrusted content arrives", () => {
    const after = taint(full);

    expect(after.tainted).toBe(true);
    expect(after.capabilities.map((c) => c.tool)).toEqual(["lookup_order", "search_docs"]);
    expect(canCall(after, "lookup_order", {}).allowed).toBe(true);
  });

  it("explains itself, so the run stopping short is debuggable", () => {
    const decision = canCall(taint(full), "issue_refund", { orderId: "o-1001" });
    expect(decision.reason).toContain("dropped when untrusted content entered");
  });

  it("cannot be undone by anything the model or a document says", () => {
    // There is no widen(). The only direction is narrower.
    const after = taint(full);
    const narrower = narrow(after, (c) => c.tool !== "search_docs");
    expect(narrower.capabilities.map((c) => c.tool)).toEqual(["lookup_order"]);
    expect(Object.keys({ narrow, taint, grant, canCall })).not.toContain("widen");
  });
});

describe("lethalTrifecta", () => {
  it("names the shape of every serious agent breach", () => {
    const verdict = lethalTrifecta({
      privateData: true,
      untrustedContent: true,
      externalCommunication: true,
    });
    expect(verdict.exposed).toBe(true);
    expect(verdict.legs).toHaveLength(3);
    expect(verdict.advice).toContain("Break one");
  });

  it("clears a design that is missing a leg", () => {
    const readOnlyIsolated = lethalTrifecta({
      privateData: true,
      untrustedContent: true,
      externalCommunication: false,
    });
    expect(readOnlyIsolated.exposed).toBe(false);
    expect(readOnlyIsolated.advice).toContain("2 of 3");
  });

  it("agrees with what taint() does: removing a leg closes the path", () => {
    const before = lethalTrifecta({
      privateData: true,
      untrustedContent: true,
      externalCommunication: true,
    });
    const afterTaint = lethalTrifecta({
      privateData: true,
      untrustedContent: true,
      externalCommunication: false, // taint() dropped every acting capability
    });
    expect(before.exposed).toBe(true);
    expect(afterTaint.exposed).toBe(false);
  });
});
