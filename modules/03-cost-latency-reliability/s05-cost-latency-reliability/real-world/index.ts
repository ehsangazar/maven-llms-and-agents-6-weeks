/**
 * S5 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Moderate a few messages on a cheap-then-strong ladder under a per-request
 * budget. Watch a confident cheap call stop early, an unsure one escalate, and
 * a tight budget force a fail-closed block.
 *
 * Run it:  npm run lab modules/03-cost-latency-reliability/s05-cost-latency-reliability/real-world/index.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { moderate, type ModerationDeps } from "./moderate.ts";

const MODEL_CHEAP = process.env.LLM_MODEL_SMALL ?? "openai/gpt-4o-mini";
const MODEL_STRONG = process.env.LLM_MODEL_LARGE ?? "openai/gpt-4o";

const Judgement = z.object({
  verdict: z.enum(["allow", "block"]),
  confident: z.boolean(),
});

const classify = (model: string) => async (text: string) =>
  extract(
    [
      { role: "system", content: "Moderate the message. Block harassment, threats, or spam. Set confident: false if it is genuinely borderline." },
      { role: "user", content: text },
    ],
    Judgement,
    "judgement",
    { model },
  );

const deps: ModerationDeps = { cheap: classify(MODEL_CHEAP), strong: classify(MODEL_STRONG) };

const messages = [
  "Thanks for the quick help earlier!",
  "you people are unbelievable, this is the worst",
];

for (const text of messages) {
  const out = await moderate(text, deps, 0.01);
  console.log(`\n> ${text}\n  ${out.verdict} via ${out.tier}  ($${out.spent.toFixed(4)})`);
}
