/**
 * S3 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Assemble a support answer's context under a tight budget, then answer using
 * only what made the cut. The irrelevant filler never reaches the model.
 *
 * Run it:  npm run lab weeks/week-2-context-retrieval/s03-context-engineering/real-world/index.ts
 */
import { complete } from "../../../../common/llm.ts";
import { assembleContext, type Piece } from "./context.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const question = "Why was I charged twice in July and can I get a refund?";

// Candidate context. In production a retriever scores these; here they are given.
const candidates: Piece[] = [
  { id: "billing-policy", score: 0.95, text: "Refunds for duplicate charges are issued automatically within 5 business days." },
  { id: "july-invoice", score: 0.9, text: "Invoice 2026-07: two charges of $49 on 2026-07-02 and 2026-07-02 (duplicate)." },
  { id: "onboarding-tips", score: 0.15, text: "Welcome! Here are five tips to get the most out of your dashboard..." },
  { id: "vpn-guide", score: 0.05, text: "To configure the VPN, open settings and choose the nearest region..." },
];

// A deliberately tight budget so cramming is not an option.
const { included, dropped } = assembleContext(candidates, 200);
console.log("included:", included.map((i) => i.id));
console.log("dropped :", dropped.map((d) => d.id));

const context = included.map((i) => `- ${i.text}`).join("\n");
const answer = await complete(
  [
    { role: "system", content: "Answer the customer using ONLY the context. If it is not there, say you are not sure." },
    { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
  ],
  { model: MODEL },
);
console.log("\nanswer:", answer);
