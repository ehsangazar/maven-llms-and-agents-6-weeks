import { describe, it, expect } from "vitest";
import { withFallback, type Step } from "./resilient.ts";

const ok = (name: string, value: string): Step<string> => ({ name, run: async () => value });
const fail = (name: string, reason: string): Step<string> => ({
  name,
  run: async () => {
    throw new Error(reason);
  },
});

describe("withFallback", () => {
  it("returns the first success and skips the rest", async () => {
    let secondRan = false;
    const out = await withFallback(
      [ok("primary", "A"), { name: "backup", run: async () => ((secondRan = true), "B") }],
      "SAFE",
    );
    expect(out.value).toBe("A");
    expect(out.via).toBe("primary");
    expect(secondRan).toBe(false);
    expect(out.failures).toEqual([]);
  });

  it("falls through failures and records each one", async () => {
    const out = await withFallback([fail("primary", "5xx"), ok("backup", "B")], "SAFE");
    expect(out.value).toBe("B");
    expect(out.via).toBe("backup");
    expect(out.failures).toEqual([{ step: "primary", reason: "5xx" }]);
  });

  it("returns the safe default when every step fails, with the full map", async () => {
    const out = await withFallback([fail("primary", "timeout"), fail("backup", "over-budget")], "SAFE");
    expect(out.value).toBe("SAFE");
    expect(out.via).toBe("safe-default");
    expect(out.failures.map((f) => f.step)).toEqual(["primary", "backup"]);
  });
});
