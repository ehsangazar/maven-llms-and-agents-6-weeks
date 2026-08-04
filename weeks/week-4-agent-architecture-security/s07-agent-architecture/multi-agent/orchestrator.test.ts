import { describe, it, expect } from "vitest";
import {
  coordinationShare,
  runOrchestrator,
  shouldSplit,
  type Subtask,
  type Worker,
} from "./orchestrator.ts";

const THREE: Subtask[] = [
  { id: "pricing", goal: "summarise the pricing page" },
  { id: "docs", goal: "summarise the API docs" },
  { id: "reviews", goal: "summarise recent reviews" },
];

describe("shouldSplit", () => {
  it("says no to a single subtask", () => {
    expect(shouldSplit({ subtasks: [THREE[0]!], contextDiffers: true }).split).toBe(false);
  });

  it("says no to a chain, because a chain is not parallelism", () => {
    const chain: Subtask[] = [
      { id: "a", goal: "fetch" },
      { id: "b", goal: "clean", dependsOn: ["a"] },
      { id: "c", goal: "write", dependsOn: ["b"] },
    ];
    const decision = shouldSplit({ subtasks: chain, contextDiffers: true });
    expect(decision.split).toBe(false);
    expect(decision.because).toContain("handoffs");
  });

  it("says no when every subtask needs the same context", () => {
    const decision = shouldSplit({ subtasks: THREE, contextDiffers: false });
    expect(decision.split).toBe(false);
    expect(decision.because).toContain("one agent");
  });

  it("says yes only for independent subtasks with genuinely different context", () => {
    expect(shouldSplit({ subtasks: THREE, contextDiffers: true }).split).toBe(true);
  });
});

describe("runOrchestrator", () => {
  const merge = (trusted: { id: string; output: string }[]) =>
    trusted.map((r) => `${r.id}: ${r.output}`).join(" | ");

  it("gives each worker a fresh history, so they cannot pollute each other", async () => {
    const seen: string[][] = [];
    const worker: Worker = async (subtask, history) => {
      history.push("a hundred lines of tool output");
      seen.push([...history]);
      return { output: `done ${subtask.id}`, costUsd: 0.01 };
    };

    await runOrchestrator(THREE, worker, merge, { budgetUsd: 1 });

    for (const history of seen) {
      expect(history).toHaveLength(2); // its own goal, plus its own noise
      expect(history[0]).toContain("goal:");
    }
  });

  it("divides the budget instead of sharing it", async () => {
    const worker: Worker = async (subtask) => ({
      output: `done ${subtask.id}`,
      // The first worker tries to eat most of the pot.
      costUsd: subtask.id === "pricing" ? 0.5 : 0.05,
    });

    const result = await runOrchestrator(THREE, worker, merge, { budgetUsd: 0.9 });

    const greedy = result.results.find((r) => r.id === "pricing");
    expect(greedy?.trusted).toBe(false);
    expect(greedy?.note).toContain("over its");
    expect(result.excluded).toEqual(["pricing"]);
  });

  it("marks a failed worker instead of quietly merging nothing", async () => {
    const worker: Worker = async (subtask) => {
      if (subtask.id === "docs") throw new Error("docs site returned 503");
      return { output: `done ${subtask.id}`, costUsd: 0.01 };
    };

    const result = await runOrchestrator(THREE, worker, merge, { budgetUsd: 1 });

    expect(result.excluded).toEqual(["docs"]);
    expect(result.merged).not.toContain("docs");
    expect(result.merged).toContain("pricing");
    // The failure is named in the output, which is how the merge stays honest.
    expect(result.results.find((r) => r.id === "docs")?.note).toContain("503");
  });

  it("counts the coordination tax, which is the number that decides the pattern", async () => {
    const worker: Worker = async (subtask) => ({ output: `done ${subtask.id}`, costUsd: 0.01 });

    const result = await runOrchestrator(THREE, worker, merge, {
      budgetUsd: 1,
      coordinationUsd: 0.03,
    });

    expect(result.totalUsd).toBeCloseTo(0.06, 5);
    expect(coordinationShare(result)).toBeCloseTo(0.5, 5); // half the bill was talking
  });

  it("refuses a split where coordination alone blows the budget", async () => {
    const worker: Worker = async () => ({ output: "", costUsd: 0 });
    await expect(
      runOrchestrator(THREE, worker, merge, { budgetUsd: 0.02, coordinationUsd: 0.05 }),
    ).rejects.toThrow("one agent");
  });
});
