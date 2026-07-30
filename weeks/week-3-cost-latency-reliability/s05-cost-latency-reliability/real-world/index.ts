/**
 * S5 real-world · replay the incident twice (needs OPENROUTER_API_KEY).
 *
 * Same alert, same logs, two investigators. The naive one sends every log line
 * it can find and asks once. The guarded one searches first, caps what reaches
 * the prompt, holds a deadline and a spend ceiling, and refuses to name a cause
 * it cannot cite.
 *
 * Then it kills the log backend and runs the guarded one again, because during a
 * real incident that is the interesting case: the dependency you need in order
 * to investigate is the one that is having the incident.
 *
 * Run it:       npm run lab weeks/week-3-cost-latency-reliability/s05-cost-latency-reliability/real-world/index.ts
 * Guarded only: npm run lab weeks/week-3-cost-latency-reliability/s05-cost-latency-reliability/real-world/index.ts --guarded
 */
import { z } from "zod";
import { extract } from "../../../../common/llm.ts";
import { ALERT, DEPLOYS, LOGS, TRUE_CAUSE, searchLogs } from "./incident.ts";
import {
  DEFAULT_GUARDS,
  investigate,
  investigateNaively,
  type Hypothesis,
  type InvestigatorDeps,
} from "./investigate.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";
const guardedOnly = process.argv.includes("--guarded");

const HypothesisSchema = z.object({
  cause: z.string(),
  evidence: z.array(z.string()),
  confident: z.boolean(),
  nextAction: z.string(),
});

const deps = (over: Partial<InvestigatorDeps> = {}): InvestigatorDeps => ({
  listDeploys: async () => DEPLOYS,
  searchLogs: async (query, limit) => searchLogs(query, limit),
  ask: async ({ alert, deploys, logs }): Promise<Hypothesis> =>
    extract(
      [
        {
          role: "system",
          content:
            "You are an on-call assistant. Propose the most likely cause of the alert. " +
            "Quote the exact log lines or deploys you are relying on in evidence. " +
            "If the context does not support a cause, set confident to false and leave evidence empty. " +
            "Never invent a log line.",
        },
        {
          role: "user",
          content: [
            `ALERT ${alert.at} ${alert.service}: ${alert.summary}`,
            `DEPLOYS:\n${deploys.map((d) => `${d.at} ${d.service} ${d.version} ${d.summary}`).join("\n") || "(unavailable)"}`,
            `LOGS:\n${logs.map((l) => `${l.at} ${l.service} ${l.level} ${l.message}`).join("\n") || "(unavailable)"}`,
          ].join("\n\n"),
        },
      ],
      HypothesisSchema,
      "hypothesis",
      { model: MODEL },
    ),
  ...over,
});

const since = (t: number) => `${Date.now() - t}ms`;
const usd = (n: number) => `$${n.toFixed(4)}`;

function verdict(h: Hypothesis | null): string {
  if (!h) return "no answer, and correctly so: it could not cite anything";
  const onTarget = /pool|connection|line[- ]item|n\+1|query per|v482/i.test(h.cause);
  return `${onTarget ? "on target" : "off target"}: ${h.cause}`;
}

console.log(`\nINCIDENT  ${ALERT.at} ${ALERT.service}: ${ALERT.summary}`);
console.log(`LOG WINDOW  ${LOGS.length} lines, 18 of which explain it`);
console.log(`(the answer, for grading only: ${TRUE_CAUSE})`);

if (!guardedOnly) {
  console.log("\n--- naive: the whole window in the prompt, one shot, no guards ---");
  const t = Date.now();
  const naive = await investigateNaively(ALERT, deps(), LOGS, DEFAULT_GUARDS);
  console.log(`  prompt   ~${naive.promptTokens} tokens`);
  console.log(`  cost     ${usd(naive.spent)}   time ${since(t)}`);
  console.log(`  verdict  ${verdict(naive.hypothesis)}`);
  console.log(`  evidence ${naive.hypothesis.evidence.length} cited`);
  console.log("  note     and this is a thirty-second window of one service. A real investigation spans minutes and a dozen services.");
}

console.log("\n--- guarded: search first, capped context, deadline, ceiling, breaker ---");
{
  const t = Date.now();
  const out = await investigate(ALERT, deps(), DEFAULT_GUARDS);
  console.log(`  served   ${out.servedBy}   steps ${out.steps}   stopped by ${out.stoppedBy}`);
  console.log(`  cost     ${usd(out.spent)}   time ${since(t)}`);
  console.log(`  verdict  ${verdict(out.hypothesis)}`);
  console.log(`  next     ${out.hypothesis?.nextAction ?? "(none)"}`);
}

console.log("\n--- guarded, with the log backend down, which is when you need it ---");
{
  const t = Date.now();
  const out = await investigate(
    ALERT,
    deps({ searchLogs: async () => { throw new Error("log backend 503"); } }),
    DEFAULT_GUARDS,
  );
  console.log(`  served   ${out.servedBy}   degraded ${out.degraded}`);
  console.log(`  cost     ${usd(out.spent)}   time ${since(t)}`);
  console.log(`  failures ${out.failures.map((f) => `${f.step}: ${f.reason}`).join(" | ")}`);
  console.log(`  verdict  ${verdict(out.hypothesis)}`);
  console.log("  note     it may still answer, citing a deploy, and be wrong. Grounded is necessary, not sufficient:");
  console.log("           that is the failure S6 scores highest, and the reason on-call is told this run was degraded.");
}

console.log("");
