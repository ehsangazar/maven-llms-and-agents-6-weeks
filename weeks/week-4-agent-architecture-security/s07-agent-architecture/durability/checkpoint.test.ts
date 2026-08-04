import { describe, it, expect } from "vitest";
import {
  MemoryRunStore,
  approve,
  replayRule,
  runDurable,
  unsafeToReplay,
  type StepDef,
} from "./checkpoint.ts";

const STEPS: StepDef[] = [
  { name: "find_order", effect: "read" },
  { name: "check_policy", effect: "read" },
  { name: "issue_refund", effect: "irreversible" },
  { name: "email_customer", effect: "irreversible" },
];

describe("runDurable", () => {
  it("checkpoints after every step, not at the end", async () => {
    const store = new MemoryRunStore();
    await runDurable("r-1", STEPS, store, async (step) => `ok ${step.name}`);

    // four steps plus the final "done" write
    expect(store.saves).toBe(STEPS.length + 1);
  });

  it("resumes where it died, and does not redo the steps it already did", async () => {
    const store = new MemoryRunStore();
    const performed: string[] = [];

    let crashOnce = true;
    const perform = async (step: StepDef) => {
      if (step.name === "issue_refund" && crashOnce) {
        crashOnce = false;
        throw new Error("pod restarted mid-run");
      }
      performed.push(step.name);
      return `ok ${step.name}`;
    };

    await expect(runDurable("r-2", STEPS, store, perform)).rejects.toThrow("pod restarted");
    expect(performed).toEqual(["find_order", "check_policy"]);

    const record = await store.load("r-2");
    expect(record?.status).toBe("failed");
    expect(record?.completed).toHaveLength(2);

    // Same run id, same store: pick up where it stopped.
    const finished = await runDurable("r-2", STEPS, store, perform);

    expect(finished.status).toBe("done");
    // The two reads were NOT repeated, and the refund fired exactly once.
    expect(performed).toEqual([
      "find_order",
      "check_policy",
      "issue_refund",
      "email_customer",
    ]);
  });

  it("without a store, a resume would re-fire every side effect", async () => {
    // The control case. A fresh run id is what "no durable state" looks like.
    const store = new MemoryRunStore();
    const refunds: string[] = [];
    const perform = async (step: StepDef) => {
      if (step.effect === "irreversible") refunds.push(step.name);
      return `ok ${step.name}`;
    };

    await runDurable("r-3", STEPS, store, perform);
    await runDurable("r-3-restarted-from-zero", STEPS, store, perform);

    expect(refunds).toEqual([
      "issue_refund",
      "email_customer",
      "issue_refund", // the customer's second refund
      "email_customer",
    ]);
  });

  it("pauses for a human without holding a process open, then continues", async () => {
    const store = new MemoryRunStore();
    const performed: string[] = [];
    const perform = async (step: StepDef) => {
      performed.push(step.name);
      return `ok ${step.name}`;
    };
    const requireApproval = (step: StepDef) => step.effect === "irreversible";

    const paused = await runDurable("r-4", STEPS, store, perform, { requireApproval });

    expect(paused.status).toBe("awaiting_approval");
    expect(paused.pending?.name).toBe("issue_refund");
    expect(performed).toEqual(["find_order", "check_policy"]);

    // A human says yes, hours later, in a different process.
    await approve("r-4", "issue_refund", store);
    const resumed = await runDurable("r-4", STEPS, store, perform, { requireApproval });

    // It ran the approved step, then stopped again at the next unapproved one.
    expect(resumed.status).toBe("awaiting_approval");
    expect(resumed.pending?.name).toBe("email_customer");
    expect(performed).toEqual(["find_order", "check_policy", "issue_refund"]);
  });
});

describe("replayRule", () => {
  it("says a read replays for free", () => {
    expect(replayRule("read").safeToReplay).toBe(true);
  });

  it("says a write is safe only because of the key", () => {
    const rule = replayRule("write");
    expect(rule.safeToReplay).toBe(true);
    expect(rule.needs).toContain("idempotency key");
  });

  it("refuses to call an irreversible step replayable", () => {
    expect(replayRule("irreversible").safeToReplay).toBe(false);
  });

  it("names the steps a resume must never redo blindly", () => {
    expect(unsafeToReplay(STEPS)).toEqual(["issue_refund", "email_customer"]);
  });
});
