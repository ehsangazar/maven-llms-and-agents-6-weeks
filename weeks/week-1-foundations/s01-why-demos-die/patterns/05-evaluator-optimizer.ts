/**
 * PATTERN 5 — Evaluator-optimizer.
 *
 * Generate, then have a second call GRADE the output against explicit criteria,
 * and loop: feed the critique back until it passes or you hit a cap. This is a
 * closed quality loop — the seed of the eval harness in module 5.
 *
 * Run it:  npm run lab weeks/week-1-foundations/s01-why-demos-die/patterns/05-evaluator-optimizer.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";

const Grade = z.object({
  passes: z.boolean(),
  critique: z.string(),
});

async function refine(task: string, maxRounds = 3): Promise<string> {
  let draft = await complete([{ role: "user", content: task }]);

  for (let round = 1; round <= maxRounds; round++) {
    const grade = await extract(
      [
        {
          role: "system",
          content: "Grade the draft. It passes only if it is one sentence, concrete, and jargon-free.",
        },
        { role: "user", content: `Task: ${task}\n\nDraft: ${draft}` },
      ],
      Grade,
      "grade",
    );
    console.log(`Round ${round}: ${grade.passes ? "PASS" : "FAIL"} — ${grade.critique}`);

    if (grade.passes) return draft;

    // Optimize: regenerate with the critique as guidance.
    draft = await complete([
      { role: "user", content: `Task: ${task}\nPrevious attempt: ${draft}\nFix this: ${grade.critique}` },
    ]);
  }

  return draft; // cap hit — return best effort rather than loop forever
}

console.log("\nFinal:", await refine("Explain what an LLM agent is to a busy CTO."));
