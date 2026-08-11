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
  "PASS only if the answer's factual claims are supported by the supplied context.",
  "FAIL if it states a policy, amount, or date that the context does not contain.",
  "FAIL if it hedges so hard it makes no claim at all.",
  "Length is not quality. A short grounded answer beats a long unsupported one.",
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
  return extract(
    [
      { role: "system", content: `You are a strict grader. Apply this rubric exactly:\n${rubric}` },
      {
        role: "user",
        content: `QUESTION\n${input.question}\n\nCONTEXT THE AGENT WAS GIVEN\n${input.context}\n\nANSWER TO GRADE\n${input.answer}`,
      },
    ],
    Verdict,
    "verdict",
    { model: opts.model, temperature: 0 },
  );
}
