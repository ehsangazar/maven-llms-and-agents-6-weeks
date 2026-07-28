/**
 * S2 real-world example, the runnable demo (needs OPENROUTER_API_KEY).
 *
 * The intake workflow wired to a real model. Watch the call count: it is two,
 * every run, because you decided the steps. The agent version of the same job
 * (workflow-vs-agent/as-agent.ts) re-derives that control flow at runtime and
 * pays a variable number of calls for it.
 *
 * Run it:  npm run lab weeks/week-1-foundations/s02-code-model-boundary/real-world/index.ts
 */
import { complete, extract } from "../../../../common/llm.ts";
import { runIntakeWorkflow, Severity, type IntakeDeps } from "./intake.ts";

const MODEL = process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

const deps: IntakeDeps = {
  summarize: (report) =>
    complete(
      [
        { role: "system", content: "Summarize this bug report in one short sentence." },
        { role: "user", content: report },
      ],
      { model: MODEL },
    ),
  classify: (summary) =>
    extract(
      [
        {
          role: "system",
          content: "Classify severity: sev1 (outage), sev2 (major broken feature), sev3 (minor).",
        },
        { role: "user", content: summary },
      ],
      Severity,
      "severity",
      { model: MODEL },
    ),
};

const report =
  "Since this morning the CSV export button spins forever and never downloads on Safari. " +
  "Chrome is fine. A few customers have complained.";

const { ticket, calls } = await runIntakeWorkflow(report, deps);
console.log(ticket);
console.log(`\nmodel calls: ${calls} (fixed every run, and that is the whole point)`);
