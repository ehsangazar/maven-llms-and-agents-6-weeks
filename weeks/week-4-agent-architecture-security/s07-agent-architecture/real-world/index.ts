/**
 * S7 real-world · the runnable demo (needs OPENROUTER_API_KEY).
 *
 * A real model drives the loop as the policy. Everything else, the tools, the
 * step cap, the budget, the server-side refund rules, is the same code the
 * offline tests exercise. That is the point: the model is a parameter.
 *
 * Run it:
 *   npm run lab weeks/week-4-agent-architecture-security/s07-agent-architecture/real-world/index.ts
 *
 * Watch for: it looks the order up before answering, the GBP 950 order gets
 * refused by the TOOL rather than by the prompt, and the run stops on its own.
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { renderHistory, type Policy } from "../loop/agent.ts";
import { createSupportDeps, createSupportRegistry, describeTools, handleTicket } from "./support.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const deps = createSupportDeps();
const catalogue = describeTools(createSupportRegistry(deps));

const ActionSchema = z.object({
  kind: z.enum(["tool", "final"]),
  name: z.string().default(""),
  args: z.string().default("{}"),
  text: z.string().default(""),
});

const policy: Policy = async (history) => {
  const decided = await extract(
    [
      {
        role: "system",
        content:
          "You are a support agent. Work in a loop: pick ONE tool, read the observation, then decide again.\n" +
          `Tools:\n${catalogue}\n` +
          "Return kind='tool' with name and args (args is a JSON object encoded as a string), " +
          "or kind='final' with text when you are done. Never invent order details: look them up. " +
          "Never claim a refund happened unless a tool said so.",
      },
      { role: "user", content: renderHistory(history) },
    ],
    ActionSchema,
    "action",
    { model: MODEL },
  );

  if (decided.kind === "tool") {
    const args = safeParse(decided.args);
    console.log(`  step -> ${decided.name}(${JSON.stringify(args)})`);
    return { action: { kind: "tools", calls: [{ name: decided.name, args }] }, costUsd: 0.0004 };
  }
  return { action: { kind: "final", text: decided.text }, costUsd: 0.0004 };
};

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Malformed arguments are not a crash. The registry hands back a readable
    // error and the model gets another turn to fix it.
    return { _raw: raw };
  }
}

const tickets = [
  "Order o-1001 turned up damaged, can I get my money back?",
  "Please refund order o-2002, I changed my mind.",
];

for (const ticket of tickets) {
  console.log(`\n--- ${ticket}`);
  const run = await handleTicket(ticket, policy, deps, { tenantId: "acme", userId: "u-1" });
  console.log(
    `stop: ${run.stopReason} · steps: ${run.steps} · tools: ${run.toolCalls} · $${run.spentUsd.toFixed(4)}`,
  );
  console.log(`answer: ${run.answer}`);
}

console.log(`\nrefunds actually issued: ${[...deps.refunded.keys()].join(", ") || "none"}`);
