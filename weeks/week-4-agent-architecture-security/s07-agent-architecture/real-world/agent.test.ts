import { describe, it, expect } from "vitest";
import { runAgent, type Policy, type Tools } from "./agent.ts";

const tools: Tools = {
  lookup: async (arg) => `plan for ${arg}: Pro`,
};

describe("runAgent", () => {
  it("returns immediately when the policy is done", async () => {
    const policy: Policy = async () => ({ kind: "final", text: "hello" });
    const run = await runAgent("hi", policy, tools);
    expect(run).toMatchObject({ answer: "hello", steps: 1, hitCap: false });
  });

  it("feeds a tool observation back into the policy", async () => {
    const policy: Policy = async (history) => {
      const sawObservation = history.some((h) => h.includes("plan for ada@x: Pro"));
      return sawObservation
        ? { kind: "final", text: "you are on Pro" }
        : { kind: "tool", name: "lookup", arg: "ada@x" };
    };
    const run = await runAgent("what plan am I on?", policy, tools);
    expect(run.answer).toBe("you are on Pro");
    expect(run.steps).toBe(2);
  });

  it("stops at the cap when the policy never finishes: the runaway guardrail", async () => {
    const runaway: Policy = async () => ({ kind: "tool", name: "lookup", arg: "x" });
    const run = await runAgent("loop", runaway, tools, 3);
    expect(run.hitCap).toBe(true);
    expect(run.steps).toBe(3);
  });

  it("handles a call to a tool that does not exist", async () => {
    let asked = false;
    const policy: Policy = async (history) => {
      if (!asked) {
        asked = true;
        return { kind: "tool", name: "ghost", arg: "" };
      }
      return { kind: "final", text: history.join(" | ") };
    };
    const run = await runAgent("q", policy, tools);
    expect(run.answer).toContain("no such tool: ghost");
  });
});
