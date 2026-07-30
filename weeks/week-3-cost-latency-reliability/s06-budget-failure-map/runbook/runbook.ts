/**
 * S6 · the runbook entry, and the six ways one is useless.
 *
 * The only real test is handing it to someone who did not build the system: if
 * they need to ask you one question, it is not finished. Most of that test is
 * mechanical, so `lintEntry` does the mechanical part and leaves you the rest.
 */

export interface RunbookEntry {
  failure: string;
  /** How you notice. Name the metric or the report, not "things look bad". */
  symptom: string;
  /** Two or three things, in order, most likely first. */
  checks: string[];
  act: {
    /** The lever. A flag name, a command, a dashboard button. */
    mitigation: string;
    /** The number that proves it worked. */
    confirmedBy: string;
  };
  /** The second move, for when the first does not work. Nobody invents this at 3am. */
  escalation?: string;
  /** What turns this incident into a permanent fix. */
  prevent: string;
  /** Has the switch in `act.mitigation` actually been flipped, at least in staging? */
  rehearsed: boolean;
}

export interface Smell {
  code:
    | "vague-verb"
    | "needs-the-author"
    | "no-confirmation"
    | "diagnosis-before-mitigation"
    | "unbounded-checks"
    | "never-rehearsed";
  message: string;
}

const VAGUE = /\b(investigate|look into|resolve the issue|fix it|monitor closely|as needed|tbd)\b/i;
const NAMES_A_PERSON = /\b(ask|check with|ping|speak to)\s+[A-Z][a-z]+/;
const ROOT_CAUSE_FIRST = /\b(root cause|find out why|work out why|diagnose)\b/i;

/** The six smells from the lesson, as checks. All six are fixable in twenty minutes. */
export function lintEntry(entry: RunbookEntry, opts: { maxChecks?: number } = {}): Smell[] {
  const maxChecks = opts.maxChecks ?? 3;
  const smells: Smell[] = [];
  const actionText = `${entry.act.mitigation} ${entry.checks.join(" ")} ${entry.prevent}`;

  if (VAGUE.test(actionText)) {
    smells.push({
      code: "vague-verb",
      message: 'vague instruction: name the command, the dashboard or the switch, not "investigate and resolve"',
    });
  }
  if (NAMES_A_PERSON.test(actionText) || NAMES_A_PERSON.test(entry.escalation ?? "")) {
    smells.push({
      code: "needs-the-author",
      message: "the entry needs a specific person: write the flag name and where it lives instead",
    });
  }
  if (entry.act.confirmedBy.trim().length < 8) {
    smells.push({
      code: "no-confirmation",
      message: "no confirmation: state the number that proves the mitigation worked",
    });
  }
  if (entry.checks.length > 0 && ROOT_CAUSE_FIRST.test(entry.checks[0] ?? "")) {
    smells.push({
      code: "diagnosis-before-mitigation",
      message: "diagnosis at step one: stop the bleeding first, root cause after",
    });
  }
  if (entry.checks.length === 0 || entry.checks.length > maxChecks) {
    smells.push({
      code: "unbounded-checks",
      message: `${entry.checks.length} checks: give the on-call ${maxChecks}, in order, most likely first`,
    });
  }
  if (!entry.rehearsed) {
    smells.push({
      code: "never-rehearsed",
      message: "the switch has never been flipped: a switch you have not flipped is not a switch",
    });
  }

  return smells;
}

/** True when the entry passes every mechanical check. The stranger test is still yours to run. */
export function isExecutable(entry: RunbookEntry): boolean {
  return lintEntry(entry).length === 0;
}
