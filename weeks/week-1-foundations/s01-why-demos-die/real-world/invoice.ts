/**
 * S1 real-world example, invoice extraction that survives real traffic.
 *
 * The demo works on the one clean invoice from the pitch. Then production sends
 * a 30-page PDF dump, a model that hallucinates a negative total, and a vendor
 * line carrying "ignore previous instructions". None of that changes the code,
 * so the code has to assume it. The fix is structural: cap the input, and let
 * NOTHING reach your ledger without passing a schema plus the domain rules an
 * invoice actually obeys.
 *
 * This module is pure and deps-injected: the model call arrives as `extract`,
 * so the guard is testable with no API key. index.ts wires the real model.
 */
import { z } from "zod";

/** What a trustworthy invoice looks like. The model proposes; this disposes. */
export const Invoice = z.object({
  vendor: z.string().min(1),
  total: z.number().nonnegative(), // a negative total is a parse error, not a refund
  currency: z.enum(["USD", "EUR", "GBP"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export type Invoice = z.infer<typeof Invoice>;

/** A crude cost ceiling. One 30-page dump should not cost 50x a normal invoice. */
export const MAX_CHARS = 6000;

/** The model call, injected. Returns UNVALIDATED output on purpose: you validate it. */
export type ExtractFn = (fencedInput: string) => Promise<unknown>;

/**
 * Parse messy invoice text into a validated Invoice, or throw.
 *
 * Two structural defenses, both independent of how clever the prompt is:
 *  - the input is capped before it ever reaches the model (cost ceiling)
 *  - the output is validated against Invoice before it is returned (nothing
 *    unvalidated leaves this function)
 */
export async function parseInvoice(raw: string, extract: ExtractFn): Promise<Invoice> {
  const capped = raw.slice(0, MAX_CHARS);
  const fenced = `<invoice>\n${capped}\n</invoice>`; // body is data, not instructions
  const proposed = await extract(fenced);
  return Invoice.parse(proposed); // throws ZodError on bad shape OR bad domain values
}
