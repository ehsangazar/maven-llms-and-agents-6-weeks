import { describe, it, expect } from "vitest";
import { handle, type CopilotDeps } from "./copilot.ts";

const deps = (over: Partial<CopilotDeps> = {}): CopilotDeps => ({
  classify: async () => "docs",
  retrieve: async () => ["refunds take 5 days"],
  answer: async (_q, ctx) => (ctx.length ? `answer from ${ctx.length} docs` : "hello there"),
  ...over,
});

describe("handle", () => {
  it("skips retrieval for small talk", async () => {
    let retrieved = false;
    const result = await handle("hi!", deps({
      classify: async () => "smalltalk",
      retrieve: async () => ((retrieved = true), []),
    }));
    expect(result.used).toEqual(["classify", "answer"]);
    expect(retrieved).toBe(false);
  });

  it("runs the full path for a docs question with context", async () => {
    const result = await handle("how long do refunds take?", deps());
    expect(result.used).toEqual(["classify", "retrieve", "answer"]);
    expect(result.answer).toContain("answer from");
  });

  it("refuses a docs question when nothing relevant is retrieved", async () => {
    const result = await handle("obscure question", deps({ retrieve: async () => [] }));
    expect(result.used).toEqual(["classify", "retrieve"]);
    expect(result.answer).toMatch(/don't have anything/);
  });
});
