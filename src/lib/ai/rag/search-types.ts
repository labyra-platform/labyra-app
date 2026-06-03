/**
 * Search types.
 * @phase R160-ai-5d-1
 */

export interface SearchRequest {
  tenantId: string;
  query: string;
  /** Top-N for vector retrieval before rerank */
  vectorTopK?: number;
  /** Top-N final after rerank */
  topN?: number;
  /** Optional filter for Pinecone (e.g. paperYear, paperDoi) */
  filter?: Record<string, unknown>;
  /** ADR-034 TEAM-5: viewer group for KB isolation (null = no group). */
  viewerGroupId?: string | null;
  /** admin/superadmin → no group filter (cross-group visibility). */
  isPrivileged?: boolean;
  /** R-collection-2: scope retrieval to papers in this collection (own
   * membership). Empty/missing collection → no hits. Omit = whole library. */
  collectionId?: string | null;
}

export interface SearchHit {
  paperId: string;
  chunkIdx: number;
  text: string;
  pages: number[];
  section: string;
  paperTitle: string;
  paperAuthors: string[];
  paperYear: number;
  paperDoi: string;
  /** Relevance score from rerank (0-1) */
  score: number;
  /** Original vector score (cosine) */
  vectorScore: number;
}

export interface SearchCost {
  embed: number;
  rerank: number;
  total: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  cost: SearchCost;
  tokensUsed: {
    embed: number;
    rerank: number;
  };
  latencyMs: number;
  /** R188-4 per-step cumulative timing marks (ms from start), for diagnostics */
  marks?: Record<string, number>;
}
