export const MEMORY_SEARCH_CONFIG = {
  lexicalOverlapThreshold: 0.72,
  rerankWeights: {
    embedding: 0.65,
    lexical: 0.2,
    recency: 0.1,
  },
  minScore: 0.05,
  defaultLimit: 8,
};

export function tokenizeForLexicalOverlap(text?: string | null): Set<string> {
  if (!text) return new Set();
  return new Set(
    (
      text
        ?.normalize("NFKD")
        .toLowerCase()
        .match(/[\p{L}\d]{3,}/gu) || []
    ).map((token) => token),
  );
}

export function lexicalOverlapScore(
  a?: string | null,
  b?: string | null,
): number {
  const tokensA = tokenizeForLexicalOverlap(a);
  const tokensB = tokenizeForLexicalOverlap(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const denominator = tokensA.size + tokensB.size - overlap;
  return denominator === 0 ? 0 : overlap / denominator;
}
