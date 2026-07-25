/**
 * PATTERN 4 — Orchestrator-workers.
 *
 * Unlike parallelization, the subtasks aren't known up front. An orchestrator
 * LLM decides how to split the work, workers do each piece, and a synthesizer
 * merges. Use it when the decomposition depends on the input.
 *
 * Run it:  npm run lab modules/01-workflows-and-agents/s01-why-demos-die/patterns/04-orchestrator-workers.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";

const Plan = z.object({ subtasks: z.array(z.string()) });

async function research(question: string): Promise<string> {
  // Orchestrator: decide the subtasks dynamically.
  const plan = await extract(
    [{ role: "user", content: `Break this into 2-4 focused research subtasks: ${question}` }],
    Plan,
    "plan",
  );
  console.log("Orchestrator planned:", plan.subtasks);

  // Workers: one per subtask, in parallel.
  const findings = await Promise.all(
    plan.subtasks.map((task) =>
      complete([{ role: "user", content: `Answer concisely: ${task}` }]),
    ),
  );

  // Synthesizer: merge the workers' output into one answer.
  return complete([
    {
      role: "user",
      content: `Original question: ${question}\n\nFindings:\n${findings.map((f, i) => `[${i + 1}] ${f}`).join("\n\n")}\n\nSynthesize one coherent answer.`,
    },
  ]);
}

console.log(await research("Should a 3-person startup self-host their LLM or use an API?"));
