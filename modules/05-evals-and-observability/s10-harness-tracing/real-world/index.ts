/**
 * S10 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * Run a small golden set through a real model classifier and print a pass-rate
 * report with the trace for each case. This is the harness Lab 5 grows into a
 * full eval suite with regression detection.
 *
 * Run it:  npm run lab modules/05-evals-and-observability/s10-harness-tracing/real-world/index.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { runSuite, type Case } from "./harness.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const Category = z.object({ category: z.enum(["billing", "technical", "sales"]) });

const cases: Case<string, string>[] = [
  { name: "double-charge", input: "I was charged twice this month", expect: "billing" },
  { name: "crash", input: "the app crashes when I export", expect: "technical" },
  { name: "pricing", input: "do you offer an annual plan?", expect: "sales" },
];

const system = async (input: string) => {
  const { category } = await extract(
    [
      { role: "system", content: "Classify the message as billing, technical, or sales." },
      { role: "user", content: input },
    ],
    Category,
    "category",
    { model: MODEL },
  );
  return { out: category, trace: ["classify"] };
};

const report = await runSuite(cases, system, (got, expected) => got === expected);

console.log(`pass rate: ${(report.passRate * 100).toFixed(0)}% (${report.passed}/${report.total})\n`);
for (const r of report.results) {
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(14)} got=${r.got}  trace=[${r.trace.join(", ")}]`);
}
