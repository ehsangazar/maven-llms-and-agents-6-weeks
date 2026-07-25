/**
 * S11 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * The mini copilot on real traffic: small talk skips retrieval, a docs question
 * pulls context and answers, an off-topic question is refused. One entry point,
 * one visible trace per request.
 *
 * Run it:  npm run lab modules/06-shipping-it/s11-capstone-clinic/real-world/index.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";
import { handle, type CopilotDeps } from "./copilot.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const KB = [
  "Refunds for duplicate charges are issued within 5 business days.",
  "You can export your data as CSV from the billing page.",
];

const Kind = z.object({ kind: z.enum(["smalltalk", "docs"]) });

const deps: CopilotDeps = {
  classify: async (q) => (await extract(
    [{ role: "system", content: "Is this small talk or a docs question?" }, { role: "user", content: q }],
    Kind,
    "kind",
    { model: MODEL },
  )).kind,
  // Toy retrieval: keep KB lines that share a keyword with the question.
  retrieve: async (q) => {
    const words = new Set(q.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    return KB.filter((line) => line.toLowerCase().split(/\W+/).some((w) => words.has(w)));
  },
  answer: (q, ctx) =>
    complete(
      [
        { role: "system", content: ctx.length ? "Answer using ONLY the context." : "Reply briefly and warmly." },
        { role: "user", content: ctx.length ? `Context:\n${ctx.join("\n")}\n\nQ: ${q}` : q },
      ],
      { model: MODEL },
    ),
};

for (const q of ["hey there!", "how long do refunds take?", "what's the capital of France?"]) {
  const result = await handle(q, deps);
  console.log(`\n> ${q}\n  used: [${result.used.join(", ")}]\n  ${result.answer}`);
}
