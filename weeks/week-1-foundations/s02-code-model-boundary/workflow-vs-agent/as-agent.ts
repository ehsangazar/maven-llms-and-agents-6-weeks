/**
 * SAME TASK, AS AN AGENT.
 *
 * Identical goal: read the email, look up the plan, draft a reply. But now WE
 * don't write the control flow — the model does. It runs in a loop, choosing a
 * tool each turn until it decides it's finished.
 *
 * Watch the call count. The agent re-derives, at runtime and at token cost, the
 * control flow the workflow got for free. Sometimes it takes 3 turns, sometimes
 * 6, occasionally it loops. THAT unpredictability is why the rule is: reach for
 * a workflow first, and only pay for an agent when the task genuinely needs to
 * decide its own steps.
 *
 * Run it:  npm run lab weeks/week-1-foundations/s02-code-model-boundary/workflow-vs-agent/as-agent.ts
 */
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1",
});
const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const PLANS: Record<string, string> = {
  "ada@example.com": "Pro ($49/mo), renews 2026-08-01",
};

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_plan",
      description: "Look up a customer's plan by email address.",
      parameters: {
        type: "object",
        properties: { email: { type: "string" } },
        required: ["email"],
      },
    },
  },
];

async function runAgent(email: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are support. Look up the customer's plan, then reply. Use tools as needed." },
    { role: "user", content: email },
  ];

  let turns = 0;
  const MAX_TURNS = 8; // the guardrail every agent loop needs

  while (turns < MAX_TURNS) {
    turns++;
    const res = await client.chat.completions.create({ model: MODEL, messages, tools });
    const msg = res.choices[0]!.message;
    messages.push(msg);

    // No tool call means the agent has decided it's done.
    if (!msg.tool_calls?.length) {
      console.log(`\n[agent] LLM calls: ${turns}`);
      return msg.content ?? "";
    }

    // Execute each requested tool and feed the result back into the loop.
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments) as { email: string };
      const result = PLANS[args.email] ?? "no plan on file";
      console.log(`  turn ${turns}: agent called ${call.function.name}(${args.email})`);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return "gave up after hitting the turn cap";
}

console.log(await runAgent("From: ada@example.com\nWhen does my subscription renew?"));
