/**
 * S9 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Two agents produced the same happy-sounding answer, but only one followed the
 * required path. The trajectory check catches the other. A model-as-judge then
 * grades the answer text, so you see both grader types side by side.
 *
 * Run it:  npm run lab modules/05-evals-and-observability/s09-trajectory-evals/real-world/index.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { checkOrder } from "./trajectory.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";
const EXPECTED = ["check_policy", "issue_refund"];

const runs = [
  { name: "correct", trace: ["greet", "check_policy", "issue_refund", "reply"], answer: "Refund issued, it met policy." },
  { name: "lucky-but-wrong", trace: ["greet", "issue_refund", "reply"], answer: "Refund issued, it met policy." },
];

// Rule-based grader: the trajectory check.
for (const run of runs) {
  const t = checkOrder(run.trace, EXPECTED);
  console.log(`${run.name}: trajectory ${t.pass ? "PASS" : "FAIL"}` + (t.pass ? "" : ` (${t.missing.length ? "missing " + t.missing : "out of order"})`));
}

// LLM-as-judge grader: does the answer claim policy was checked?
const Judge = z.object({ grounded: z.boolean(), why: z.string() });
const judged = await extract(
  [
    { role: "system", content: "Judge whether the answer's claim ('it met policy') is something the agent could know. Answer grounded true/false." },
    { role: "user", content: `Trace: ${runs[1]!.trace.join(", ")}\nAnswer: ${runs[1]!.answer}` },
  ],
  Judge,
  "judge",
  { model: MODEL },
);
console.log("\nLLM judge on lucky-but-wrong:", judged);
