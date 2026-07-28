/**
 * PATTERN 1 — Prompt chaining.
 *
 * Break one hard task into ordered steps, and GATE between them: if a step's
 * output fails a cheap check, stop before spending money on the next step.
 * Here: outline -> (gate: enough sections?) -> draft.
 *
 * Run it:  npm run lab weeks/week-1-foundations/s01-why-demos-die/patterns/01-prompt-chaining.ts
 */
import { z } from "zod";
import { complete, extract } from "../../../../common/llm.ts";

const Outline = z.object({ sections: z.array(z.string()) });

async function writePost(topic: string): Promise<string> {
  // Step 1: outline.
  const outline = await extract(
    [{ role: "user", content: `Give a 3-5 section outline for a short post about: ${topic}` }],
    Outline,
    "outline",
  );

  // The gate. A programmatic check between LLM calls — no model needed.
  if (outline.sections.length < 3) {
    throw new Error(`Outline too thin (${outline.sections.length} sections); stopping before we draft.`);
  }
  console.log("Gate passed. Outline:", outline.sections);

  // Step 2: draft, now conditioned on validated structure.
  return complete([
    { role: "user", content: `Write a short post about "${topic}" following exactly this outline:\n${outline.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}` },
  ]);
}

console.log(await writePost("why most tasks want a workflow, not an agent"));
