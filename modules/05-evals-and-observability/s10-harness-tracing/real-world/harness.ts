/**
 * S10 real-world example, the workshop harness: run cases, capture traces,
 * report a pass rate.
 *
 * The smallest thing that deserves to be called an eval harness: a golden set,
 * a system under test, a grader, and a report that survives an empty run without
 * dividing by zero. Each result keeps the trace, which is the observability half
 * of the session.
 *
 * Pure and deps-injected: the system and grader are parameters, so the harness
 * is testable with no API key.
 */
export interface Case<I, O> {
  name: string;
  input: I;
  expect: O;
}

export interface CaseResult<O> {
  name: string;
  pass: boolean;
  got: O;
  trace: string[];
}

export interface SuiteReport<O> {
  passRate: number;
  passed: number;
  total: number;
  results: CaseResult<O>[];
}

export async function runSuite<I, O>(
  cases: Case<I, O>[],
  system: (input: I) => Promise<{ out: O; trace: string[] }>,
  grade: (got: O, expected: O) => boolean,
): Promise<SuiteReport<O>> {
  const results: CaseResult<O>[] = [];
  for (const c of cases) {
    const { out, trace } = await system(c.input);
    results.push({ name: c.name, pass: grade(out, c.expect), got: out, trace });
  }
  const passed = results.filter((r) => r.pass).length;
  const passRate = results.length ? passed / results.length : 0; // no divide-by-zero
  return { passRate, passed, total: results.length, results };
}
