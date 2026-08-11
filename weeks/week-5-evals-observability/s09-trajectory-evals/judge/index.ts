/**
 * S9 judge demo (needs OPENROUTER_API_KEY).
 *
 * Two answers to the same question. One cites the clause it was given, one
 * invents a policy that reads beautifully. A rule-based grader cannot tell them
 * apart. A judge can, and then you check the judge.
 *
 * Run it:  npm run lab weeks/week-5-evals-observability/s09-trajectory-evals/judge/index.ts
 */
import { judgeAnswer } from "./judge.ts";
import { scoreJudge, type Labelled } from "./agreement.ts";

const CONTEXT = [
  "Booking BA-2490. Fare class: Saver. Cancelled by carrier on 3 Aug.",
  "Policy clause 4.2 (carrier-cancellation): full refund to original payment method,",
  "no fee, processed within 7 working days. No other refund route applies to Saver.",
].join(" ");

const QUESTION = "I want a refund for BA-2490, you cancelled it.";

const answers = [
  {
    name: "grounded",
    text: "You are covered by clause 4.2, carrier-cancellation: a full refund to your original card, no fee, within 7 working days.",
  },
  {
    name: "fluent-but-invented",
    text: "Absolutely, I have applied our standard 15% goodwill credit on top of your refund, and waived the £35 Saver change fee for you.",
  },
];

for (const answer of answers) {
  const verdict = await judgeAnswer({ question: QUESTION, context: CONTEXT, answer: answer.text });
  console.log(`${answer.name}: ${verdict.pass ? "PASS" : "FAIL"} — ${verdict.reason}`);
}

// Now the part everybody skips. A judge you have not scored is an opinion with
// an API bill. These are hand labels from a previous run; yours come from an
// afternoon with a spreadsheet.
const labelled: Labelled[] = [
  ...Array.from({ length: 46 }, (_, i) => ({ id: `p${i}`, human: true, judge: i !== 3 })),
  ...Array.from({ length: 24 }, (_, i) => ({ id: `f${i}`, human: false, judge: i < 2 })),
];

console.log("\njudge scorecard:", scoreJudge(labelled));
