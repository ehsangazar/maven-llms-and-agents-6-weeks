/**
 * S3 real-world example, what earns a place in the window.
 *
 * A support answer has more candidate context than fits: order history, KB
 * articles, prior tickets. Cramming it all in is worse than choosing well, it
 * costs more and buries the relevant line. So you rank by relevance and pack
 * greedily under a budget, and you accept that some pieces get dropped.
 *
 * Pure and deterministic: no model, no key. index.ts uses the assembled context
 * to answer with a real model.
 */
export interface Piece {
  id: string;
  text: string;
  /** Relevance to the question, 0..1. In production a retriever scores this. */
  score: number;
}

export interface Assembled {
  included: Piece[];
  dropped: Piece[];
  usedChars: number;
}

/**
 * Rank by score, then pack under a character budget. A piece that does not fit
 * is dropped, and we keep going: a smaller, lower-ranked piece may still fit.
 */
export function assembleContext(pieces: Piece[], budgetChars: number): Assembled {
  const ranked = [...pieces].sort((a, b) => b.score - a.score);
  const included: Piece[] = [];
  const dropped: Piece[] = [];
  let usedChars = 0;

  for (const piece of ranked) {
    if (usedChars + piece.text.length <= budgetChars) {
      included.push(piece);
      usedChars += piece.text.length;
    } else {
      dropped.push(piece);
    }
  }

  return { included, dropped, usedChars };
}
