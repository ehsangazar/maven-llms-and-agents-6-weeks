/**
 * LAB 1 — the runnable demo (STARTER).
 *
 * This is the router from `router.ts` wired to a real model and fed a small
 * sample of traffic. The tests prove the logic; this shows you the bill.
 *
 * Run it:  npm run lab weeks/week-1-foundations/lab-workflow-router/starter/index.ts
 *
 * Needs OPENROUTER_API_KEY in .env. The tests do not — that is the point of the
 * seam. Get `npm test` green first, then come here.
 */
import { complete, extract } from "../../../../common/llm.ts";
import {
  Classification,
  Ledger,
  Reply,
  runRouter,
  TIER_COST,
  type RouterDeps,
  type Tier,
} from "./router.ts";

/** Which real model backs each tier. Right-sizing, in one object. */
const MODEL_FOR: Record<"small" | "large", string> = {
  small: process.env.LLM_MODEL_SMALL ?? "openai/gpt-4o-mini",
  large: process.env.LLM_MODEL_LARGE ?? "openai/gpt-4o",
};

const deps: RouterDeps = {
  async classify(request) {
    return extract(
      [
        {
          role: "system",
          content:
            "Classify the support request. `complexity` is trivial when a canned answer would do, " +
            "hard when it needs real reasoning about the customer's specific situation.",
        },
        { role: "user", content: request },
      ],
      Classification,
      "classification",
      { model: MODEL_FOR.small }, // classify with the cheap model. It is a small job.
    );
  },

  async callModel(tier, request) {
    // Deliberately returns unvalidated output: runRouter validates it.
    return extract(
      [
        {
          role: "system",
          content:
            "You are a support agent. Answer the request. Set confident: false if you " +
            "genuinely cannot answer well from what you were given.",
        },
        { role: "user", content: request },
      ],
      Reply,
      "reply",
      { model: MODEL_FOR[tier] },
    );
  },

  rules(request) {
    // The tier with no model in it. Every request this absorbs is free and
    // instant, and it never hallucinates. Push work down here whenever you can.
    const text = request.toLowerCase().trim();
    if (/^(hi|hello|hey|thanks|thank you)\b/.test(text)) {
      return { answer: "Hi! How can I help today?", confident: true };
    }
    return null;
  },
};

const TRAFFIC = [
  "hello there",
  "thanks!",
  "I was double charged for July, can you refund it?",
  "The export button does nothing on Safari.",
  "Does your DPA cover EU data residency for a UK-based controller?",
];

const ledger = new Ledger();

for (const request of TRAFFIC) {
  const reply = await runRouter(request, deps, ledger);
  console.log(`\n> ${request}\n  ${reply.answer}`);
}

const report = ledger.report();
console.log("\n─── cost report ───");
for (const tier of ["rules", "small", "large"] as Tier[]) {
  const t = report.byTier[tier];
  console.log(
    `  ${tier.padEnd(6)} ${String(t.attempts).padStart(2)} attempts  ` +
      `${(t.share * 100).toFixed(0).padStart(3)}% of traffic  $${t.cost.toFixed(4)}`,
  );
}
console.log(`  total  $${report.totalCost.toFixed(4)}`);

// The number that matters: what you avoided by not sending everything to the
// frontier model. This is the S5 argument, made concrete on your own traffic.
const allLarge = ledger.attempts.length * TIER_COST.large;
console.log(
  `\n  all-large would have cost $${allLarge.toFixed(4)} — routing saved ` +
    `${(((allLarge - report.totalCost) / allLarge) * 100).toFixed(0)}%`,
);
