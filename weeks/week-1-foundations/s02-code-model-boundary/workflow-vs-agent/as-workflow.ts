/**
 * SAME TASK, AS A WORKFLOW.
 *
 * Task: given a customer email, look up their plan and draft a reply.
 * The control flow is FIXED and written by us: classify -> lookup -> draft.
 * Exactly 2 LLM calls, every time. You can predict the cost and the latency.
 *
 * Run it:  npm run lab weeks/week-1-foundations/s02-code-model-boundary/workflow-vs-agent/as-workflow.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";

// A fake "database" the workflow calls directly — no LLM involved.
const PLANS: Record<string, string> = {
  "ada@example.com": "Pro ($49/mo), renews 2026-08-01",
};

const Lookup = z.object({ email: z.string() });

async function handleEmail(email: string): Promise<string> {
  let calls = 0;

  // Call 1 (LLM): pull the customer's address out of the email.
  calls++;
  const { email: address } = await extract(
    [{ role: "user", content: `Extract the sender's email address:\n${email}` }],
    Lookup,
    "lookup",
  );

  // Deterministic step: WE decide to look up the plan. The model doesn't.
  const plan = PLANS[address] ?? "no plan on file";

  // Call 2 (LLM): draft the reply with the plan already in hand.
  calls++;
  const reply = await complete([
    { role: "system", content: "Draft a short, friendly support reply." },
    { role: "user", content: `Email: ${email}\nTheir plan: ${plan}` },
  ]);

  console.log(`\n[workflow] LLM calls: ${calls}`);
  return reply;
}

console.log(await handleEmail("From: ada@example.com\nWhen does my subscription renew?"));
