/**
 * PATTERN 2 — Routing.
 *
 * Classify the input once, then dispatch to a handler specialized for that
 * class. Cheaper and more reliable than one mega-prompt that tries to do
 * everything. This is the seed of the graded Lab 01.
 *
 * Run it:  npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/02-routing.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";

const Route = z.object({
  category: z.enum(["billing", "technical", "sales"]),
  reason: z.string(),
});

// One specialized handler per route. Each gets its own system prompt.
const handlers: Record<z.infer<typeof Route>["category"], string> = {
  billing: "You are a billing specialist. Be precise about charges and refunds.",
  technical: "You are a support engineer. Ask for repro steps and be concrete.",
  sales: "You are a sales rep. Be warm and move toward a demo.",
};

async function handle(message: string): Promise<string> {
  const route = await extract(
    [{ role: "system", content: "Classify the customer message." }, { role: "user", content: message }],
    Route,
    "route",
  );
  console.log(`Routed to ${route.category} (${route.reason})`);

  return complete([
    { role: "system", content: handlers[route.category] },
    { role: "user", content: message },
  ]);
}

console.log(await handle("I was double charged and want my money back."));
