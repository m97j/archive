import type {
  HybridSearchInput,
  HybridSearchResult,
  PublicContentSummary,
} from "@archive/contracts";
import type { EmbeddingVector, KnowledgeProvider } from "@archive/content-engine";
import type { SearchCandidate } from "@archive/db";

function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
}
function sparseCosine(left: Record<string, number>, right: Record<string, number>): number {
  let dot = 0;
  for (const [key, value] of Object.entries(left)) dot += value * (right[key] ?? 0);
  return dot / (Math.hypot(...Object.values(left)) * Math.hypot(...Object.values(right)) || 1);
}
/** Rank fusion keeps lexical, dense and sparse scores on independent scales. */
export function fuseSearch(
  lexical: PublicContentSummary[],
  candidates: SearchCandidate[],
  query: EmbeddingVector,
  model: string,
  limit: number,
): PublicContentSummary[] {
  const compatible = candidates.filter(
    (candidate) => candidate.model === model && candidate.dimension === query.dense.length,
  );
  const dense = compatible
    .map((candidate) => ({ candidate, score: cosine(query.dense, candidate.dense) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const sparse = compatible
    .map((candidate) => ({ candidate, score: sparseCosine(query.sparse, candidate.sparse) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const scores = new Map<string, { item: PublicContentSummary; score: number }>();
  for (const ranking of [
    lexical,
    dense.map(({ candidate }) => candidate.summary),
    sparse.map(({ candidate }) => candidate.summary),
  ]) {
    const seen = new Set<string>();
    ranking.forEach((item, index) => {
      if (seen.has(item.contentId)) return;
      seen.add(item.contentId);
      const existing = scores.get(item.contentId);
      scores.set(item.contentId, {
        item: existing?.item ?? item,
        score: (existing?.score ?? 0) + 1 / (60 + index + 1),
      });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.item.contentId.localeCompare(b.item.contentId))
    .slice(0, limit)
    .map(({ item }) => item);
}
export function createHybridSearch(options: {
  provider?: KnowledgeProvider;
  lexical(input: HybridSearchInput): Promise<PublicContentSummary[]>;
  candidates(locale: HybridSearchInput["locale"]): Promise<SearchCandidate[]>;
}): (input: HybridSearchInput) => Promise<HybridSearchResult> {
  return async (input) => {
    const lexical = await options.lexical(input);
    const fallback: HybridSearchResult = {
      items: lexical.slice(0, input.limit ?? 20),
      mode: "lexical",
      providerAvailable: false,
    };
    if (!options.provider) return fallback;
    const candidates = await options.candidates(input.locale);
    if (!candidates.length) return fallback;
    try {
      const response = await options.provider.embeddings([input.q]);
      const query = response.embeddings[0];
      if (
        !query ||
        !candidates.some(
          (candidate) =>
            candidate.model === response.model && candidate.dimension === response.dimension,
        )
      )
        return fallback;
      return {
        items: fuseSearch(lexical, candidates, query, response.model, input.limit ?? 20),
        mode: "hybrid",
        providerAvailable: true,
      };
    } catch {
      return fallback;
    }
  };
}
