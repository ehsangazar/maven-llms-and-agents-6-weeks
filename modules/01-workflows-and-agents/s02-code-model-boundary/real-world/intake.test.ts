import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runIntakeWorkflow, type IntakeDeps } from "./intake.ts";

const okDeps = (over: Partial<IntakeDeps> = {}): IntakeDeps => ({
  summarize: async () => "export button crashes on Safari",
  classify: async () => "sev2",
  ...over,
});

describe("runIntakeWorkflow", () => {
  it("produces a ticket with a validated severity", async () => {
    const { ticket } = await runIntakeWorkflow("long bug report...", okDeps());
    expect(ticket.severity).toBe("sev2");
    expect(ticket.title).toBe("export button crashes on Safari");
  });

  it("always costs exactly two model calls: the point of a workflow", async () => {
    const { calls } = await runIntakeWorkflow("anything", okDeps());
    expect(calls).toBe(2);
  });

  it("runs the steps in a fixed order: summarize feeds classify", async () => {
    const order: string[] = [];
    await runIntakeWorkflow("report", {
      summarize: async () => {
        order.push("summarize");
        return "a summary";
      },
      classify: async (summary) => {
        order.push("classify");
        expect(summary).toBe("a summary"); // classify sees the summary, not the raw report
        return "sev3";
      },
    });
    expect(order).toEqual(["summarize", "classify"]);
  });

  it("rejects a severity the classifier made up", async () => {
    await expect(
      runIntakeWorkflow("x", okDeps({ classify: async () => "urgent" })),
    ).rejects.toThrow(z.ZodError);
  });
});
