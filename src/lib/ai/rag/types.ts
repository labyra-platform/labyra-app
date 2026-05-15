/**
 * RAG types — paper chunks, retrieval results, citation sources.
 * @phase R160-ai-5a
 */

/** A chunk of text from a paper, ready for embedding/retrieval */
export interface PaperChunk {
  /** Unique chunk ID, format: {paperId}-{chunkIdx} */
  id: string;
  paperId: string;
  chunkIdx: number;
  /** Raw chunk text (will be embedded) */
  text: string;
  /** Contextualized text (chunk + surrounding context, for Voyage embedding) */
  contextualText?: string;
  /** Page numbers this chunk spans (1-indexed) */
  pages: number[];
  /** Section heading if available (e.g. "Introduction", "Results") */
  section?: string;
}

// @phase R167-B0: Paper interface moved entirely to src/types/papers.ts
// (PROV-O extended schemaVersion=2 per ADR-016).
// This file keeps only retrieval-side types (PaperChunk, RagSource, RetrievalResult).

/** A retrieved chunk with similarity score */
export interface RagSource {
  chunk: PaperChunk;
  paperTitle: string;
  paperAuthors: string[];
  paperYear?: number;
  paperDoi?: string;
  /** Cosine similarity score from vector search */
  score: number;
  /** Rerank score (if rerank applied) */
  rerankScore?: number;
}

/** Full retrieval result for a query */
export interface RetrievalResult {
  sources: RagSource[];
  query: string;
  /** Total chunks retrieved before rerank */
  candidatesCount: number;
  /** Whether rerank was applied */
  reranked: boolean;
  /** Time breakdown */
  latencyMs: {
    embedding: number;
    vectorSearch: number;
    rerank: number;
    total: number;
  };
  /** Cost breakdown */
  cost: {
    embeddingUsd: number;
    rerankUsd: number;
    totalUsd: number;
  };
}
