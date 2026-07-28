/**
 * The spec for the S1 real-world guard. No API key, no network: the model call
 * is injected, so every rule the guard enforces is checked deterministically.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseInvoice, MAX_CHARS, type ExtractFn } from "./invoice.ts";

const good = { vendor: "Acme Ltd", total: 420.5, currency: "USD", date: "2026-07-01" };

/** An ExtractFn that ignores its input and returns a fixed payload. */
const returning = (payload: unknown): ExtractFn => async () => payload;

describe("parseInvoice", () => {
  it("returns a validated invoice for well-formed model output", async () => {
    expect(await parseInvoice("anything", returning(good))).toEqual(good);
  });

  // .toThrow(z.ZodError) specifically, not a bare .toThrow(): a broken guard
  // that threw for the wrong reason would still pass a bare assertion.
  it("rejects output missing a required field", async () => {
    const noTotal = { vendor: good.vendor, currency: good.currency, date: good.date };
    await expect(parseInvoice("x", returning(noTotal))).rejects.toThrow(z.ZodError);
  });

  it("rejects a negative total, a domain rule the schema encodes", async () => {
    await expect(parseInvoice("x", returning({ ...good, total: -50 }))).rejects.toThrow(z.ZodError);
  });

  it("rejects a currency it doesn't recognise", async () => {
    await expect(parseInvoice("x", returning({ ...good, currency: "BTC" }))).rejects.toThrow(z.ZodError);
  });

  it("caps the input before the model ever sees it", async () => {
    let seen = -1;
    const spy: ExtractFn = async (fenced) => {
      seen = fenced.length;
      return good;
    };
    await parseInvoice("a".repeat(MAX_CHARS * 3), spy);
    // the <invoice> wrapper adds a few chars, so allow a small margin
    expect(seen).toBeGreaterThan(MAX_CHARS - 1);
    expect(seen).toBeLessThanOrEqual(MAX_CHARS + 40);
  });
});
