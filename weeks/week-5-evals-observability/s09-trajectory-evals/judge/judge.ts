/**
 * S9 · LLM-as-judge, the grader for things code cannot check.
 *
 * "Did it call check_policy" is a rule. "Did it cite the clause instead of
 * inventing one" is a judgement, and the only graders that scale to judgement
 * are people and models. So you use a model, and then you check the model
 * against the people, in `agreement.ts`.
 *
 * The vendor lives behind `common/llm.ts`, as everywhere in this course, so the
 * judge outlives whichever model you are using this quarter.
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";

/** A judge returns a decision AND its reason. The reason is what you audit. */
export const Verdict = z.object({
  pass: z.boolean(),
  reason: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

/**
 * A rubric is not a vibe. It names the evidence that decides the call, so two
 * runs of the same judge on the same answer land in the same place.
 */
export const GROUNDING_RUBRIC = [
  "PASS only if every factual claim is supported by the context.",
  "FAIL on any policy, amount or date the context does not contain.",
  "FAIL if it hedges so hard it makes no claim at all.",
  "Length is not quality. Short and grounded beats long and unsupported.",
].join("\n");

export interface JudgeInput {
  question: string;
  context: string;
  answer: string;
}

/**
 * Grade one answer against a rubric.
 *
 * temperature 0, because a grader that disagrees with itself between runs turns
 * every eval diff into noise.
 */
export async function judgeAnswer(
  input: JudgeInput,
  rubric: string = GROUNDING_RUBRIC,
  opts: { model?: string } = {},
): Promise<Verdict> {
  const system = `You are a strict grader. Apply this rubric exactly:\n${rubric}`;
  const user = [
    `QUESTION\n${input.question}`,
    `CONTEXT THE AGENT WAS GIVEN\n${input.context}`,
    `ANSWER TO GRADE\n${input.answer}`,
  ].join("\n\n");

  return extract(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    Verdict,
    "verdict",
    { model: opts.model, temperature: 0 },
  );
}
