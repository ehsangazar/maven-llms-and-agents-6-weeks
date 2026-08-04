/**
 * S7 · the four architecture decisions, printed for one system. No API key.
 *
 * Change `SYSTEM` to describe your own project and run it again. The output is
 * the shape of the answer Project 3 wants: a choice, a reason, and the failure
 * mode you are accepting.
 *
 * Run it:
 *   npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/decide.ts
 */
import { PLANNERS, chainSuccess, choosePlanner, maxStepsFor } from "./planning/planner.ts";
import { unsafeToReplay, type StepDef } from "./durability/checkpoint.ts";
import { shouldSplit, type Subtask } from "./multi-agent/orchestrator.ts";

const SYSTEM = {
  name: "Order support agent",
  task: {
    pathKnown: false,
    stepsDependOnResults: true,
    qualityOverCost: false,
  },
  steps: [
    { name: "lookup_order", effect: "read" },
    { name: "read_refund_policy", effect: "read" },
    { name: "issue_refund", effect: "irreversible" },
    { name: "email_customer", effect: "irreversible" },
  ] satisfies StepDef[],
  subtasks: [
    { id: "answer", goal: "answer the customer" },
    { id: "audit", goal: "write the audit note", dependsOn: ["answer"] },
  ] satisfies Subtask[],
  contextDiffers: false,
  perStepReliability: 0.95,
  targetRunReliability: 0.9,
};

const line = (label: string, value: string) => console.log(`${label.padEnd(22)} ${value}`);

console.log(`\n== ${SYSTEM.name} ==\n`);

// 1 · How does it decide the next step?
const planner = choosePlanner(SYSTEM.task);
const profile = PLANNERS.find((p) => p.kind === planner.kind);
line("1 · planning", planner.kind);
line("   because", planner.because);
line("   breaks as", profile?.breaksAs ?? "");
line("   guardrail", profile?.guardrail ?? "");

// 2 · How long may it run?
const affordable = maxStepsFor(SYSTEM.perStepReliability, SYSTEM.targetRunReliability);
console.log("");
line("2 · step budget", `${affordable} steps before run reliability drops under ${SYSTEM.targetRunReliability}`);
for (const steps of [1, 3, 5, 10, 20]) {
  const rate = chainSuccess(SYSTEM.perStepReliability, steps);
  line(`   ${String(steps).padStart(2)} steps`, `${(rate * 100).toFixed(1)}% of runs fully correct`);
}

// 3 · What must never be replayed?
console.log("");
const unsafe = unsafeToReplay(SYSTEM.steps);
line("3 · durability", unsafe.length ? `checkpoint required before: ${unsafe.join(", ")}` : "nothing irreversible");
line("   rule", "reads replay free, writes need a key, money needs a key and a log");

// 4 · One agent, or several?
console.log("");
const split = shouldSplit({ subtasks: SYSTEM.subtasks, contextDiffers: SYSTEM.contextDiffers });
line("4 · shape", split.split ? "multi-agent" : "single agent");
line("   because", split.because);

console.log("\nEvery line above is a sentence you can defend in Project 3.\n");
