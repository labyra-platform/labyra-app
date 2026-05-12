/**
 * Reciprocal Rank Fusion (RRF) algorithm.
 * @phase R160-ai-5d-2
 *
 * Combines ranked lists from different retrievers into a single fused ranking.
 * Standard formula (Cormack et al. 2009): score(d) = sum(1 / (k + rank_i(d)))
 * where k is a constant (typically 60) and rank_i(d) is rank in list i.
 *
 * Why RRF over weighted sum?
 * - No need to normalize scores across different scales (vector cosine vs BM25 score)
 * - Robust to outliers
 * - Industry standard for hybrid retrieval
 */

export interface RankedItem {
  /** Unique ID (e.g. chunkId) */
  id: string;
  /** Position in ranked list, 0-indexed */
  rank: number;
}

export interface FusedItem {
  id: string;
  /** Fused RRF score */
  score: number;
  /** Source ranks (debug) */
  sourceRanks: number[];
}

const DEFAULT_K = 60;

/**
 * Fuse multiple ranked lists into one.
 * @param lists Each list is sorted by relevance (most relevant first).
 * @param k Constant in RRF formula (default 60).
 * @returns Fused list sorted by RRF score descending.
 */
export function reciprocalRankFusion(lists: RankedItem[][], k: number = DEFAULT_K): FusedItem[] {
  const itemScores = new Map<string, { score: number; ranks: number[] }>();

  for (const list of lists) {
    for (const item of list) {
      const contribution = 1 / (k + item.rank);
      const existing = itemScores.get(item.id);
      if (existing) {
        existing.score += contribution;
        existing.ranks.push(item.rank);
      } else {
        itemScores.set(item.id, { score: contribution, ranks: [item.rank] });
      }
    }
  }

  return Array.from(itemScores.entries())
    .map(([id, { score, ranks }]) => ({ id, score, sourceRanks: ranks }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Helper: convert score-ranked items to RRF-compatible rank list.
 */
export function toRankedList<T extends { id: string; score: number }>(items: T[]): RankedItem[] {
  return items
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((item, rank) => ({ id: item.id, rank }));
}
