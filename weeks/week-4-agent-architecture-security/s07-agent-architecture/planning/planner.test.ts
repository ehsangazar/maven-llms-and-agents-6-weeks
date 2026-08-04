import { describe, it, expect } from "vitest";
import {
  PLANNERS,
  chainSuccess,
  chainSuccessWithChecks,
  choosePlanner,
  maxStepsFor,
  runPlan,
  type PlanStepResult,
} from "./planner.ts";

describe("choosePlanner", () => {
  it("picks a plain workflow when the path is known", () => {
    const choice = choosePlanner({
      pathKnown: true,
      stepsDependOnResults: false,
      qualityOverCost: false,
    });
    expect(choice.kind).toBe("none");
  });

  it("picks react when the next step is only knowable after the last one", () => {
    const choice = choosePlanner({
      pathKnown: false,
      stepsDependOnResults: true,
      qualityOverCost: false,
    });
    expect(choice.kind).toBe("react");
  });

  it("picks plan-then-execute for a predictable shape with unpredictable content", () => {
    const choice = choosePlanner({
      pathKnown: true,
      stepsDependOnResults: true,
      qualityOverCost: false,
    });
    expect(choice.kind).toBe("plan_then_execute");
  });

  it("picks reflect only when quality is explicitly worth the extra calls", () => {
    const choice = choosePlanner({
      pathKnown: false,
      stepsDependOnResults: false,
      qualityOverCost: true,
    });
    expect(choice.kind).toBe("reflect");
  });

  it("documents a failure mode and a guardrail for every planner", () => {
    for (const planner of PLANNERS) {
      expect(planner.breaksAs.length).toBeGreaterThan(10);
      expect(planner.guardrail.length).toBeGreaterThan(10);
    }
  });
});

describe("chainSuccess", () => {
  it("multiplies, which is why long agent runs quietly fail", () => {
    expect(chainSuccess(0.95, 1)).toBeCloseTo(0.95, 4);
    expect(chainSuccess(0.95, 10)).toBeCloseTo(0.5987, 3); // 95 percent per step, 60 percent per run
    expect(chainSuccess(0.99, 20)).toBeCloseTo(0.8179, 3);
  });

  it("says how many steps you can afford before a target slips", () => {
    expect(maxStepsFor(0.95, 0.9)).toBe(2);
    expect(maxStepsFor(0.99, 0.9)).toBe(10);
    expect(maxStepsFor(0.999, 0.9)).toBe(105);
  });

  it("shows what a check between steps buys you", () => {
    const bare = chainSuccess(0.9, 10);
    const checked = chainSuccessWithChecks(0.9, 10, 0.8);
    expect(bare).toBeCloseTo(0.3487, 3);
    expect(checked).toBeCloseTo(0.8171, 3); // same model, one validation step
  });
});

describe("runPlan", () => {
  it("runs the plan in order and passes earlier results forward", async () => {
    const seen: number[] = [];
    const run = await runPlan(["a", "b", "c"], async (step, previous) => {
      seen.push(previous.length);
      return `did ${step}`;
    });

    expect(run.completed).toBe(true);
    expect(seen).toEqual([0, 1, 2]);
    expect(run.results.map((r: PlanStepResult) => r.output)).toEqual(["did a", "did b", "did c"]);
  });

  it("stops instead of building the rest of the plan on a bad step", async () => {
    const run = await runPlan(["a", "b", "c"], async (step) => `did ${step}`, {
      validate: ({ step }) => step !== "b",
    });

    expect(run.completed).toBe(false);
    expect(run.results).toHaveLength(2); // c never ran on top of a broken b
  });

  it("replans once when reality disagrees with the plan", async () => {
    const run = await runPlan(["a", "b", "c"], async (step) => `did ${step}`, {
      validate: ({ step }) => step !== "b",
      replan: async () => ["b2", "c"],
    });

    expect(run.replans).toBe(1);
    expect(run.completed).toBe(true);
    expect(run.results.map((r) => r.step)).toEqual(["a", "b", "b2", "c"]);
  });

  it("will not replan forever", async () => {
    const run = await runPlan(["a"], async (step) => `did ${step}`, {
      validate: () => false,
      replan: async () => ["a"],
      maxReplans: 2,
    });

    expect(run.replans).toBe(2);
    expect(run.completed).toBe(false);
  });
});
