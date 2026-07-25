/**
 * THE DEMO.
 *
 * Parse a support ticket into structured fields. This is the version that
 * ships to the investor demo: it works, it's short, everyone claps.
 *
 * Run it:  npm run lab modules/01-workflows-and-agents/s01-why-demos-die/hook/naive.ts
 */
import { complete } from "../../../../common/llm.ts";

interface Ticket {
  category: string;
  priority: string;
  summary: string;
}

async function parseTicket(raw: string): Promise<Ticket> {
  const text = await complete([
    {
      role: "system",
      content:
        "Extract the support ticket as JSON with keys: category, priority, summary. Return ONLY JSON.",
    },
    { role: "user", content: raw },
  ]);

  // The demo assumption: the model always returns clean JSON.
  return JSON.parse(text) as Ticket;
}

const happyPath =
  "Hi, I was charged twice for my subscription this month and I need a refund.";

const ticket = await parseTicket(happyPath);
console.log("Parsed ticket:", ticket);
