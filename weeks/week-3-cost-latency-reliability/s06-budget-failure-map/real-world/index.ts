/**
 * S6 real-world · the investigator's worst failure, live (needs OPENROUTER_API_KEY).
 *
 * Same incident as S5. Here we care about one row of the failure map: the model
 * naming a cause that nothing in the retrieved context supports.
 *
 * Three runs:
 *   1. the real context, through the fallback ladder, grounded and handed on
 *   2. a starved context, where the honest answer is "I do not know", and you
 *      watch whether the model takes the bait
 *   3. a deliberately fabricated hypothesis, to prove the check catches it even
 *      when the writing is excellent
 *
 * Run it:  npm run lab weeks/week-3-cost-latency-reliability/s06-budget-failure-map/real-world/index.ts
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { ALERT, DEPLOYS, searchLogs } from "./incident.ts";
import { checkGrounding, handOver, tally, type Context, type Hypothesis } from "./grounding.ts";
import { withFallback, type Step } from "./resilient.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const HypothesisSchema = z.object({
  cause: z.string(),
  evidence: z.array(z.string()),
  confident: z.boolean(),
  nextAction: z.string(),
});

const REFUSAL: Hypothesis = {
  cause: "not established",
  evidence: [],
  confident: false,
  nextAction: "page the checkout-api owner with the deploy list",
};

async function ask(context: Context): Promise<Hypothesis> {
  return extract(
    [
      {
        role: "system",
        content:
          "You are an on-call assistant. Propose the most likely cause of the alert. " +
          "Quote the exact log lines or deploys you rely on in evidence. " +
          "If the context does not support a cause, set confident to false and leave evidence empty. " +
          "Never invent a log line.",
      },
      {
        role: "user",
        content: [
          `ALERT ${ALERT.at} ${ALERT.service}: ${ALERT.summary}`,
          `DEPLOYS:\n${context.deploys.map((d) => `${d.at} ${d.service} ${d.version} ${d.summary}`).join("\n") || "(none)"}`,
          `LOGS:\n${context.logs.map((l) => `${l.at} ${l.service} ${l.level} ${l.message}`).join("\n") || "(none)"}`,
        ].join("\n\n"),
      },
    ],
    HypothesisSchema,
    "hypothesis",
    { model: MODEL },
  );
}

/** The ladder from resilient.ts: ask, then a cheaper ask, then an honest refusal. */
function ladder(context: Context): Step<Hypothesis>[] {
  return [
    { name: "model", run: () => ask(context) },
    { name: "refusal", run: async () => REFUSAL },
  ];
}

async function run(label: string, context: Context, note: string): Promise<ReturnType<typeof checkGrounding>> {
  const out = await withFallback(ladder(context), REFUSAL);
  const handover = handOver(out.value, context, ["deploys", "checkout-api errors", "checkout-api warnings"]);
  console.log(`\n--- ${label} ---`);
  console.log(`  via        ${out.via}${out.failures.length ? `  (after ${out.failures.map((f) => f.step).join(", ")})` : ""}`);
  console.log(`  grounding  ${handover.verdict.status}`);
  console.log(`  actionable ${handover.actionable}`);
  console.log(`  handover   ${handover.message.replace(/\n/g, "\n             ")}`);
  console.log(`  note       ${note}`);
  return handover.verdict;
}

const RETRIEVED = [
  ...searchLogs("checkout-api level:error", 12),
  ...searchLogs("checkout-api level:warn", 8),
];

console.log(`\nINCIDENT  ${ALERT.at} ${ALERT.service}: ${ALERT.summary}`);
console.log(`RETRIEVED ${RETRIEVED.length} log lines out of a 1,218-line window`);

const verdicts = [];

verdicts.push(
  await run(
    "full context",
    { logs: RETRIEVED, deploys: DEPLOYS },
    "the easy case: it can cite, so on-call gets a cause and a next action.",
  ),
);

verdicts.push(
  await run(
    "starved context: deploys only, no logs",
    { logs: [], deploys: DEPLOYS },
    "the honest answer is 'I do not know'. Watch what it cites instead: quoting the alert back at you is not evidence of a cause, and the check knows the difference.",
  ),
);

// 3. A fabricated hypothesis, no model needed: the check is the thing on trial.
{
  const fabricated: Hypothesis = {
    cause: "the search-api rerank timeout bump is backing up checkout",
    evidence: ["checkout-api error: rerank upstream timeout after 400ms"],
    confident: true,
    nextAction: "roll back search-api v77",
  };
  const context: Context = { logs: RETRIEVED, deploys: DEPLOYS };
  const handover = handOver(fabricated, context, ["deploys", "checkout-api errors"]);
  verdicts.push(checkGrounding(fabricated, context));
  console.log("\n--- a fabricated hypothesis, well written ---");
  console.log(`  grounding  ${handover.verdict.status}`);
  console.log(`  actionable ${handover.actionable}`);
  console.log(`  handover   ${handover.message.replace(/\n/g, "\n             ")}`);
  console.log("  note       plausible, fluent, cites a log line that does not exist. Nothing threw.");
}

const stats = tally(verdicts);
console.log(
  `\nungrounded rate across these ${stats.total} runs: ${Math.round(stats.ungroundedRate * 100)} percent`,
);
console.log("That number is the signal this failure mode needs. Without it, wrong and right look identical.\n");
