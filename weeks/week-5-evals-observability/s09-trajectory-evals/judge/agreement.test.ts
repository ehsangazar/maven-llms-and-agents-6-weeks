import { describe, it, expect } from "vitest";
import { scoreJudge, type Labelled } from "./agreement.ts";

/** Build a labelled set: `pass` humans-say-pass cases, `fail` humans-say-fail. */
function build(pass: number, fail: number, judge: (human: boolean, i: number) => boolean): Labelled[] {
  const rows: Labelled[] = [];
  for (let i = 0; i < pass; i++) rows.push({ id: `p${i}`, human: true, judge: judge(true, i) });
  for (let i = 0; i < fail; i++) rows.push({ id: `f${i}`, human: false, judge: judge(false, i) });
  return rows;
}

describe("scoreJudge", () => {
  it("rejects a judge that says pass to everything on a mostly-passing set", () => {
    // 93 of 100 cases pass. The judge always says pass, so it agrees 93% of the
    // time and has learned nothing. This is the slide.
    const report = scoreJudge(build(93, 7, () => true));

    expect(report.agreement).toBeCloseTo(0.93);
    expect(report.baseline).toBeCloseTo(0.93);
    expect(report.lift).toBeCloseTo(0);
    expect(report.falsePass).toBe(7);
    expect(report.trustworthy).toBe(false);
  });

  it("accepts a judge that beats the baseline with few false passes", () => {
    // 50/50 set, judge is wrong on 2 passes and 2 failures, so 96% agreement
    // against a 50% baseline. That lift is what earns it the job.
    const report = scoreJudge(build(50, 50, (human, i) => (i < 2 ? !human : human)));

    expect(report.agreement).toBeCloseTo(0.96);
    expect(report.baseline).toBeCloseTo(0.5);
    expect(report.lift).toBeCloseTo(0.46);
    expect(report.falsePass).toBe(2);
    expect(report.trustworthy).toBe(true);
  });

  it("refuses to trust a perfect judge on a tiny slice", () => {
    const report = scoreJudge(build(5, 5, (human) => human));

    expect(report.agreement).toBe(1);
    expect(report.trustworthy).toBe(false);
  });

  it("rejects an otherwise-good judge that waves failures through", () => {
    // 90% agreement and a big lift, but 10 of the 50 real failures were passed.
    const report = scoreJudge(build(50, 50, (human, i) => (human ? true : i < 10)));

    expect(report.lift).toBeGreaterThan(0.1);
    expect(report.falsePass).toBe(10);
    expect(report.trustworthy).toBe(false);
  });
});
