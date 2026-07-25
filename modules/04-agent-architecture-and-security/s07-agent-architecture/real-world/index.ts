/**
 * S7 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * A real model drives the ReAct loop as the policy, choosing between a `lookup`
 * tool and finishing. The step cap is still there as the guardrail. Watch the
 * turn-by-turn actions the model chooses.
 *
 * Run it:  npm run lab modules/04-agent-architecture-and-security/s07-agent-architecture/real-world/index.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { runAgent, type Policy, type Tools } from "./agent.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const PLANS: Record<string, string> = { "ada@example.com": "Pro ($49/mo), renews 2026-08-01" };
const tools: Tools = {
  lookup_plan: async (email) => PLANS[email] ?? "no plan on file",
};

const ActionSchema = z.object({
  kind: z.enum(["tool", "final"]),
  name: z.string().default(""),
  arg: z.string().default(""),
  text: z.string().default(""),
});

const policy: Policy = async (history) => {
  const decided = await extract(
    [
      {
        role: "system",
        content:
          "You are a support agent using a ReAct loop. Tools: lookup_plan(email). " +
          "Return kind='tool' with name and arg to call a tool, or kind='final' with text when done. " +
          "Do not invent plan details; look them up.",
      },
      { role: "user", content: history.join("\n") },
    ],
    ActionSchema,
    "action",
    { model: MODEL },
  );
  if (decided.kind === "tool") {
    console.log(`  -> tool ${decided.name}(${decided.arg})`);
    return { kind: "tool", name: decided.name, arg: decided.arg };
  }
  return { kind: "final", text: decided.text };
};

const run = await runAgent("From: ada@example.com, when does my plan renew?", policy, tools);
console.log(`\nsteps: ${run.steps} (cap not hit: ${!run.hitCap})`);
console.log("answer:", run.answer);
