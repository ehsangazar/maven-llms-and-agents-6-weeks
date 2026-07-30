import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../reliability/breaker.ts";
import { ALERT, DEPLOYS, LOGS, searchLogs } from "./incident.ts";
import {
  DEFAULT_GUARDS,
  askCost,
  investigate,
  investigateNaively,
  type Guards,
  type Hypothesis,
  type InvestigatorDeps,
} from "./investigate.ts";

const grounded: Hypothesis = {
  cause: "v482 issues one query per line item and exhausted the connection pool",
  evidence: ["PoolTimeoutError", "db pool: 20/20"],
  confident: true,
  nextAction: "roll back checkout-api to v481",
};

const guessing: Hypothesis = {
  cause: "probably the new footer",
  evidence: [],
  confident: true,
  nextAction: "investigate the web deploy",
};

const deps = (over: Partial<InvestigatorDeps> = {}): InvestigatorDeps => ({
  listDeploys: async () => DEPLOYS,
  searchLogs: async (query, limit) => searchLogs(query, limit),
  ask: async () => grounded,
  ...over,
});

const guards = (over: Partial<Guards> = {}): Guards => ({ ...DEFAULT_GUARDS, ...over });

const clock = (start = 0) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe("the happy path", () => {
  it("answers from evidence and says so", async () => {
    const out = await investigate(ALERT, deps(), guards());
    expect(out.servedBy).toBe("grounded");
    expect(out.hypothesis?.cause).toContain("connection pool");
    expect(out.stoppedBy).toBe("answered");
    expect(out.failures).toEqual([]);
  });

  it("costs a fraction of the naive version, because the search did the narrowing", async () => {
    const out = await investigate(ALERT, deps(), guards());
    const naive = await investigateNaively(ALERT, deps(), LOGS, guards());
    expect(out.steps).toBe(1);
    expect(out.spent).toBeLessThan(naive.spent / 5);
  });

  it("surfaces the lines that matter, not the first twenty lines it finds", async () => {
    let seen: string[] = [];
    await investigate(
      ALERT,
      deps({ ask: async ({ logs }) => ((seen = logs.map((l) => l.message)), grounded) }),
      guards(),
    );
    expect(seen.some((m) => m.includes("PoolTimeoutError"))).toBe(true);
    expect(seen.some((m) => m.includes("thumbnail"))).toBe(false);
  });

  it("prices both paths through the same function, or the comparison proves nothing", () => {
    expect(askCost(20, guards())).toBeLessThan(askCost(LOGS.length, guards()));
    expect(askCost(0, guards())).toBeGreaterThan(0); // the instructions are not free
  });

  it("never puts more log lines in the prompt than the cap allows", async () => {
    let sent = 0;
    await investigate(
      ALERT,
      deps({ ask: async ({ logs }) => ((sent = logs.length), grounded) }),
      guards({ maxLogLines: 4 }),
    );
    expect(sent).toBe(4);
  });
});

describe("the dependency you need is the one that is down", () => {
  it("degrades to deploys alone when log search is unavailable", async () => {
    const out = await investigate(
      ALERT,
      deps({
        searchLogs: async () => { throw new Error("log backend 503"); },
        ask: async ({ logs }) => (logs.length === 0 ? guessing : grounded),
      }),
      guards(),
    );
    expect(out.degraded).toBe(true);
    expect(out.servedBy).toBe("deploy-only");
    expect(out.failures[0]?.reason).toContain("503");
  });

  it("stops asking the log backend once the breaker opens, instead of queueing on a corpse", async () => {
    let searches = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 30_000 });
    await investigate(
      ALERT,
      deps({ searchLogs: async () => { searches++; throw new Error("timeout"); } }),
      guards(),
      breaker,
    );
    expect(searches).toBe(1);
    expect(breaker.current()).toBe("open");
  });

  it("still answers when the deploy list is the thing that is down", async () => {
    const out = await investigate(
      ALERT,
      deps({ listDeploys: async () => { throw new Error("deploy API 500"); } }),
      guards(),
    );
    expect(out.degraded).toBe(true);
    expect(out.servedBy).toBe("grounded"); // logs were enough
  });

  it("returns no answer at all rather than a fabricated one when everything is down", async () => {
    const out = await investigate(
      ALERT,
      deps({
        listDeploys: async () => { throw new Error("deploy API 500"); },
        searchLogs: async () => { throw new Error("log backend 503"); },
        ask: async () => guessing,
      }),
      guards(),
    );
    expect(out.servedBy).toBe("no-answer");
    expect(out.hypothesis).toBeNull();
    expect(out.stoppedBy).toBe("no-evidence");
  });
});

describe("the guards", () => {
  it("caps the loop, so an unsure model cannot become your budget", async () => {
    let asks = 0;
    const out = await investigate(
      ALERT,
      deps({ ask: async () => (asks++, { ...grounded, confident: false }) }),
      guards({ maxSteps: 3, spendCeiling: 10 }),
    );
    expect(asks).toBe(3);
    expect(out.stoppedBy).toBe("steps");
  });

  it("halts on the spend ceiling before the step cap, whichever bites first", async () => {
    const g = guards({ maxSteps: 10 });
    const ceiling = askCost(g.maxLogLines, g) * 2.5 + g.costPerSearch;
    const out = await investigate(
      ALERT,
      deps({ ask: async () => ({ ...grounded, confident: false }) }),
      { ...g, spendCeiling: ceiling },
    );
    expect(out.steps).toBe(2);
    expect(out.stoppedBy).toBe("spend");
    expect(out.spent).toBeLessThanOrEqual(ceiling);
  });

  it("stops when the page has been open longer than on-call will wait", async () => {
    const c = clock();
    const out = await investigate(
      ALERT,
      deps({
        ask: async () => { c.advance(6_000); return { ...grounded, confident: false }; },
      }),
      guards({ deadlineMs: 10_000, maxSteps: 5, now: c.now }),
    );
    expect(out.stoppedBy).toBe("deadline");
    expect(out.steps).toBe(2);
  });
});

describe("fail closed on grounding", () => {
  it("refuses a confident cause that cites nothing", async () => {
    const out = await investigate(ALERT, deps({ ask: async () => guessing }), guards());
    expect(out.hypothesis).toBeNull();
    expect(out.servedBy).toBe("deploy-only");
  });

  it("survives the model itself failing, and records it", async () => {
    let calls = 0;
    const out = await investigate(
      ALERT,
      deps({
        ask: async () => {
          if (++calls === 1) throw new Error("model 429");
          return grounded;
        },
      }),
      guards({ maxSteps: 3, spendCeiling: 10 }),
    );
    expect(out.servedBy).toBe("grounded");
    expect(out.failures[0]?.step).toBe("ask#1");
  });
});
