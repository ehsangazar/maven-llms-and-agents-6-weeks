import { describe, it, expect } from "vitest";
import { DEPLOYS, LOGS } from "./incident.ts";
import { checkGrounding, handOver, tally, type Context, type Hypothesis } from "./grounding.ts";

const context: Context = { logs: LOGS, deploys: DEPLOYS };
const CHECKS = ["deploys in the last 30 min", "checkout-api errors", "checkout-api warnings"];

const real: Hypothesis = {
  cause: "v482 issues one query per line item and exhausted the connection pool",
  evidence: ["PoolTimeoutError: timed out acquiring a connection after 2000ms", "db pool: 20/20 connections in use"],
  confident: true,
  nextAction: "roll back checkout-api to v481",
};

/** Plausible, well written, cites a log line that does not exist. This is the dangerous one. */
const fabricated: Hypothesis = {
  cause: "the search-api rerank timeout bump is backing up checkout",
  evidence: ["checkout-api error: rerank upstream timeout after 400ms"],
  confident: true,
  nextAction: "roll back search-api v77",
};

describe("checkGrounding", () => {
  it("accepts evidence that appears in what was retrieved", () => {
    const verdict = checkGrounding(real, context);
    expect(verdict.status).toBe("grounded");
  });

  it("catches a fabricated quote, however plausible it reads", () => {
    const verdict = checkGrounding(fabricated, context);
    expect(verdict.status).toBe("unsupported");
    if (verdict.status === "unsupported") {
      expect(verdict.invented).toHaveLength(1);
      expect(verdict.supported).toHaveLength(0);
    }
  });

  it("catches a hypothesis that is right but half invented", () => {
    const mixed = { ...real, evidence: [...real.evidence, "OOMKilled: checkout-api pod restarted"] };
    const verdict = checkGrounding(mixed, context);
    expect(verdict.status).toBe("unsupported");
    if (verdict.status === "unsupported") {
      expect(verdict.supported).toHaveLength(2);
      expect(verdict.invented).toEqual(["OOMKilled: checkout-api pod restarted"]);
    }
  });

  it("accepts a deploy as evidence, not just a log line", () => {
    const fromDeploy = { ...real, evidence: ["batch the cart line-item lookups"] };
    expect(checkGrounding(fromDeploy, context).status).toBe("grounded");
  });

  it("ignores whitespace and case, because quoting is never byte exact", () => {
    const sloppy = { ...real, evidence: ["  DB POOL:   20/20 connections in use "] };
    expect(checkGrounding(sloppy, context).status).toBe("grounded");
  });

  it("separates 'cited nothing' from 'cited something false'", () => {
    expect(checkGrounding({ ...real, evidence: [] }, context).status).toBe("no-evidence");
  });

  it("is not fooled by evidence that only exists in the cause text", () => {
    const selfReferential = { ...real, evidence: [real.cause] };
    expect(checkGrounding(selfReferential, context).status).toBe("unsupported");
  });
});

describe("handOver", () => {
  it("passes on a grounded cause with its evidence and a next action", () => {
    const out = handOver(real, context, CHECKS);
    expect(out.actionable).toBe(true);
    expect(out.message).toContain("roll back checkout-api to v481");
    expect(out.message).toContain("PoolTimeoutError");
  });

  it("downgrades a fabricated cause instead of forwarding it", () => {
    const out = handOver(fabricated, context, CHECKS);
    expect(out.actionable).toBe(false);
    expect(out.message).not.toContain("roll back search-api");
    expect(out.message).toContain("Discarded");
  });

  it("still tells on-call what it checked, because that is worth something at 3am", () => {
    const out = handOver(fabricated, context, CHECKS);
    for (const check of CHECKS) expect(out.message).toContain(check);
  });

  it("handles having no hypothesis at all", () => {
    const out = handOver(null, context, CHECKS);
    expect(out.actionable).toBe(false);
    expect(out.verdict.status).toBe("no-evidence");
  });

  it("says so plainly when it checked nothing", () => {
    expect(handOver(null, context, []).message).toContain("nothing");
  });
});

describe("the signal this failure mode needs", () => {
  it("counts how often it passed on something it could not cite", () => {
    const verdicts = [real, real, fabricated, { ...real, evidence: [] }].map((h) =>
      checkGrounding(h, context),
    );
    const stats = tally(verdicts);
    expect(stats).toMatchObject({ total: 4, grounded: 2, unsupported: 1, noEvidence: 1 });
    expect(stats.ungroundedRate).toBe(0.5);
  });

  it("reports zero rather than dividing by an empty week", () => {
    expect(tally([]).ungroundedRate).toBe(0);
  });
});
