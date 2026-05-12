/**
 * searchPapers — main retrieval function.
 * @phase R160-ai-5d-1
 *
 * Cascade: Vector top-K → Voyage rerank → top-N
 *
 * Future (ai-5d-2): hybrid with BM25 + RRF fusion before rerank.
 */
import 'server-only';
import { getEmbeddingProvider } from './embedding';
import { getVectorStore } from './vector-store';
import { getRerankProvider } from './rerank';
import type { SearchRequest, SearchResponse, SearchHit } from './search-types';
import type { PaperChunkMetadata } from './vector-store/pinecone';

const DEFAULT_VECTOR_TOP_K = 20;
const DEFAULT_TOP_N = 5;

/**
 * Multi-tenant paper search with vector + rerank cascade.
 * Returns top-N most relevant chunks with paper metadata.
 */
export async function searchPapers(req: SearchRequest): Promise<SearchResponse> {
  const startedAt = Date.now();
  const vectorTopK = req.vectorTopK ?? DEFAULT_VECTOR_TOP_K;
  const topN = req.topN ?? DEFAULT_TOP_N;

  // ─── STEP 1: Embed query (Voyage voyage-3-large, input_type=query) ──
  const embedder = getEmbeddingProvider();
  const embedResult = await embedder.embed([req.query], 'query');
  const queryVector = embedResult.embeddings[0];
  const embedTokens = embedResult.totalTokens;
  const embedCost = embedResult.costUsd;

  // ─── STEP 2: Vector search Pinecone (tenant namespace) ──────────
  const vectorStore = getVectorStore();
  const vectorMatches = await vectorStore.query(req.tenantId, queryVector, vectorTopK, req.filter);

  if (vectorMatches.length === 0) {
    return {
      hits: [],
      cost: { embed: embedCost, rerank: 0, total: embedCost },
      tokensUsed: { embed: embedTokens, rerank: 0 },
      latencyMs: Date.now() - startedAt
    };
  }

  // ─── STEP 3: Rerank with Voyage rerank-2.5 ──────────────────────
  const rerankProvider = getRerankProvider();
  const documents = vectorMatches.map((m) => {
    const meta = m.metadata as PaperChunkMetadata;
    return meta.text ?? '';
  });

  const rerankResult = await rerankProvider.rerank({
    query: req.query,
    documents,
    topN
  });

  // ─── STEP 4: Build hits with full metadata ──────────────────────
  const hits: SearchHit[] = rerankResult.results.map((r) => {
    const original = vectorMatches[r.index];
    const meta = original.metadata as PaperChunkMetadata;

    let pages: number[] = [];
    try {
      pages = meta.pagesJson ? JSON.parse(meta.pagesJson) : [];
    } catch {
      pages = [];
    }

    return {
      paperId: meta.paperId,
      chunkIdx: meta.chunkIdx,
      text: meta.text,
      pages,
      section: meta.section,
      paperTitle: meta.paperTitle,
      paperAuthors: meta.paperAuthors,
      paperYear: meta.paperYear,
      paperDoi: meta.paperDoi,
      score: r.relevanceScore,
      vectorScore: original.score
    };
  });

  const totalCost = embedCost + rerankResult.costUsd;

  return {
    hits,
    cost: {
      embed: embedCost,
      rerank: rerankResult.costUsd,
      total: Number(totalCost.toFixed(6))
    },
    tokensUsed: {
      embed: embedTokens,
      rerank: rerankResult.tokensUsed
    },
    latencyMs: Date.now() - startedAt
  };
}
