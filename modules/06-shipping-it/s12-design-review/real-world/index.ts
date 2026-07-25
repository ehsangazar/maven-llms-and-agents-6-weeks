/**
 * S12 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Fold a set of eval results into a ship / hold scorecard, then have a model
 * write the one-paragraph review summary you would open the design review with.
 * The verdict is decided by code; the model only narrates it.
 *
 * Run it:  npm run lab modules/06-shipping-it/s12-design-review/real-world/index.ts
 */
import { complete } from "../../../../common/llm.ts";
import { buildScorecard, type Section } from "./scorecard.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const sections: Section[] = [
  { name: "routing (Lab 1)", passRate: 0.96 },
  { name: "retrieval (Lab 2)", passRate: 0.91 },
  { name: "budget/fallback (Lab 3)", passRate: 0.94 },
  { name: "agent guardrails (Lab 4)", passRate: 1.0, safetyFailure: true }, // one injection got through
  { name: "eval coverage (Lab 5)", passRate: 0.88 },
];

const card = buildScorecard(sections);
console.log(card.lines.join("\n"));
console.log(`\nverdict: ${card.verdict.toUpperCase()}`);

const summary = await complete(
  [
    { role: "system", content: "Write a 2-sentence design-review opener. Be direct about the verdict and the blocker." },
    { role: "user", content: `Verdict: ${card.verdict}\n${card.lines.join("\n")}` },
  ],
  { model: MODEL },
);
console.log("\nreview opener:", summary);
