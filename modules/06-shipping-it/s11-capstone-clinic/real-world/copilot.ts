/**
 * S11 real-world example, a mini support copilot that wires the course together.
 *
 * One entry point, one control flow: classify the request, and only reach for
 * retrieval when the question actually needs docs. Small talk skips it; a docs
 * question with no relevant context refuses rather than guessing. This is the
 * integration shape you defend in the design clinic, before the full capstone.
 *
 * Pure and deps-injected: classify, retrieve, and answer arrive as `deps`, so
 * the wiring (which component runs when) is testable with no API key.
 */
export interface CopilotDeps {
  classify(question: string): Promise<"smalltalk" | "docs">;
  retrieve(question: string): Promise<string[]>;
  answer(question: string, context: string[]): Promise<string>;
}

export interface CopilotResult {
  answer: string;
  /** Which components ran, in order. The integration's trace. */
  used: string[];
}

export async function handle(question: string, deps: CopilotDeps): Promise<CopilotResult> {
  const kind = await deps.classify(question);

  if (kind === "smalltalk") {
    return { answer: await deps.answer(question, []), used: ["classify", "answer"] };
  }

  const context = await deps.retrieve(question);
  if (context.length === 0) {
    return { answer: "I don't have anything on that yet.", used: ["classify", "retrieve"] };
  }

  return { answer: await deps.answer(question, context), used: ["classify", "retrieve", "answer"] };
}
