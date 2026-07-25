/**
 * S2 real-world example, the deterministic side of the boundary.
 *
 * Bug-report intake as a WORKFLOW: summarize, then classify severity, then
 * assemble a ticket. You wrote the steps, so the call count is fixed at two
 * every time. That predictability is the whole argument for reaching for a
 * workflow before an agent (see workflow-vs-agent/ next door for the contrast).
 *
 * Pure and deps-injected: the model calls arrive as `deps`, so the control flow
 * is testable with no API key. index.ts wires the real model.
 */
import { z } from "zod";

export const Severity = z.enum(["sev1", "sev2", "sev3"]);
export type Severity = z.infer<typeof Severity>;

export interface Ticket {
  title: string;
  severity: Severity;
  body: string;
}

export interface IntakeDeps {
  summarize(report: string): Promise<string>;
  /** Returns UNVALIDATED output on purpose: the workflow validates it. */
  classify(summary: string): Promise<unknown>;
}

/**
 * Run the fixed intake pipeline. Returns the ticket and the number of model
 * calls it took, which is always two: that number is the point of the example.
 */
export async function runIntakeWorkflow(
  report: string,
  deps: IntakeDeps,
): Promise<{ ticket: Ticket; calls: number }> {
  let calls = 0;

  const summary = await deps.summarize(report);
  calls++;

  const severity = Severity.parse(await deps.classify(summary));
  calls++;

  const ticket: Ticket = { title: summary.slice(0, 80).trim(), severity, body: report };
  return { ticket, calls };
}
