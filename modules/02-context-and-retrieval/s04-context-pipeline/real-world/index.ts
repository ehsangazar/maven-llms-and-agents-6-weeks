/**
 * S4 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Run a small doc set through the pipeline (dedup + freshness + budget), then
 * answer from what survives. Note the stale duplicate and the old doc getting
 * pushed out before the model is ever called.
 *
 * Run it:  npm run lab modules/02-context-and-retrieval/s04-context-pipeline/real-world/index.ts
 */
import { complete } from "../../../../common/llm.ts";
import { prepareContext, type Doc } from "./pipeline.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const question = "How long do refunds take?";

const docs: Doc[] = [
  { id: "policy-v2", text: "Refunds are processed within 5 business days.", ageDays: 3, relevance: 0.9 },
  { id: "policy-v1", text: "Refunds are processed within 8 business days.", ageDays: 400, relevance: 0.9 }, // stale dup
  { id: "old-promo", text: "Refunds took up to 30 days during our 2019 pilot.", ageDays: 2500, relevance: 0.8 },
  { id: "faq", text: "You can track a refund from the billing page.", ageDays: 10, relevance: 0.6 },
];

const prepared = prepareContext(docs, 300);
console.log("kept:", prepared.map((d) => d.id));

const context = prepared.map((d) => `- ${d.text}`).join("\n");
const answer = await complete(
  [
    { role: "system", content: "Answer using ONLY the context provided." },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
  ],
  { model: MODEL },
);
console.log("\nanswer:", answer);
