/**
 * S6 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Answer a question through a fallback ladder: a (deliberately broken) primary,
 * a real model backup, and a canned safe default. The primary is forced to fail
 * so you can watch the ladder do its job and print the failure-mode map.
 *
 * Run it:  npm run lab modules/03-cost-latency-reliability/s06-budget-failure-map/real-world/index.ts
 */
import { complete } from "../../../../common/llm.ts";
import { withFallback, type Step } from "./resilient.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";
const question = "In one sentence, what is a semantic cache?";

const steps: Step<string>[] = [
  {
    name: "primary-region",
    run: async () => {
      throw new Error("503 from primary region");
    },
  },
  {
    name: "backup-model",
    run: () => complete([{ role: "user", content: question }], { model: MODEL }),
  },
  {
    name: "canned",
    run: async () => "Sorry, I can't answer that right now.",
  },
];

const out = await withFallback(steps, "Sorry, I can't answer that right now.");
console.log("answered via:", out.via);
console.log("failure map :", out.failures);
console.log("\nanswer:", out.value);
