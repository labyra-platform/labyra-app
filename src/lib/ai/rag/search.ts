/**
 * searchPapers — hybrid retrieval (vector + BM25 + RRF + rerank).
 * @phase R160-ai-5d-2 (upgraded from ai-5d-1 vector+rerank only)
 */
import 'server-only';
// R188-4-phase1-tool-timeout
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { PaperChunkDoc } from '@/types/papers';
import { getEmbeddingProvider } from './embedding';
import { reciprocalRankFusion, toRankedList } from './fusion/rrf';
import { getRerankProvider } from './rerank';
import type { SearchHit, SearchRequest, SearchResponse } from './search-types';
import { getBM25ForTenant } from './sparse/bm25-manager';
import { getVectorStore } from './vector-store';
import type { PaperChunkMetadata } from './vector-store/pinecone';

const DEFAULT_VECTOR_TOP_K = 20;
const DEFAULT_BM25_TOP_K = 20;
const DEFAULT_FUSED_TOP_K = 20;
const DEFAULT_TOP_N = 5;

// Sections to exclude from retrieval (boilerplate, citations, low-info)
// References dense with keywords cause BM25 to surface them in top results.
const EXCLUDED_SECTIONS = [
  'References',
  'REFERENCES',
  'Notes and references',
  'Bibliography',
  'Author contributions',
  'ASSOCIATED CONTENT',
  'Terms and Conditions'
];

interface HitCandidate {
  chunkId: string;
  paperId: string;
  chunkIdx: number;
  text: string;
  metadata: Partial<PaperChunkMetadata>;
  vectorScore?: number;
  bm25Score?: number;
}

/**
 * Hybrid paper search with cascade: [vector, BM25] → RRF → rerank.
 */
export async function searchPapers(req: SearchRequest): Promise<SearchResponse> {
  const startedAt = Date.now();
  // R188-4 phase1 (T-7): per-step timing to identify the real bottleneck.
  const _marks: Record<string, number> = {};
  const _mark = (k: string) => {
    _marks[k] = Date.now() - startedAt;
  };
  const vectorTopK = req.vectorTopK ?? DEFAULT_VECTOR_TOP_K;
  const topN = req.topN ?? DEFAULT_TOP_N;

  // ─── STEP 1: Parallel retrieval ─────────────────────────────────
  const embedder = getEmbeddingProvider();
  const bm25Promise = getBM25ForTenant(req.tenantId);
  const embedPromise = embedder.embed([req.query], 'query');

  const [embedResult, bm25Encoder] = await Promise.all([embedPromise, bm25Promise]);
  _mark('parallel_embed_and_bm25_load');
  const queryVector = embedResult.embeddings[0];
  const embedTokens = embedResult.totalTokens;
  const embedCost = embedResult.costUsd;

  // Vector retrieval (always available)
  const vectorStore = getVectorStore();
  // Merge user filter with section exclusion
  const mergedFilter: Record<string, unknown> = {
    ...req.filter,
    section: { $nin: EXCLUDED_SECTIONS }
  };

  const vectorMatches = await vectorStore.query(
    req.tenantId,
    queryVector,
    vectorTopK,
    mergedFilter
  );
  _mark('vector_query');

  // BM25 retrieval (only if encoder available — may be null for new tenants)
  let bm25Hits: { chunkId: string; score: number; chunk: PaperChunkDoc }[] = [];
  if (bm25Encoder) {
    bm25Hits = await retrieveBM25(req.tenantId, req.query, bm25Encoder, DEFAULT_BM25_TOP_K);
    _mark('bm25_retrieve');
  }

  // ─── STEP 2: Build candidate map ────────────────────────────────
  const candidates = new Map<string, HitCandidate>();

  for (const m of vectorMatches) {
    const meta = m.metadata as PaperChunkMetadata;
    const chunkId = `${meta.paperId}-${meta.chunkIdx}`;
    candidates.set(chunkId, {
      chunkId,
      paperId: meta.paperId,
      chunkIdx: meta.chunkIdx,
      text: meta.text,
      metadata: meta,
      vectorScore: m.score
    });
  }

  for (const h of bm25Hits) {
    const chunkId = h.chunkId;
    const existing = candidates.get(chunkId);
    if (existing) {
      existing.bm25Score = h.score;
    } else {
      candidates.set(chunkId, {
        chunkId,
        paperId: h.chunk.paperId,
        chunkIdx: h.chunk.chunkIdx,
        text: h.chunk.text,
        metadata: {
          paperId: h.chunk.paperId,
          chunkIdx: h.chunk.chunkIdx,
          text: h.chunk.text,
          pagesJson: JSON.stringify(h.chunk.pages),
          section: h.chunk.section
        },
        bm25Score: h.score
      });
    }
  }

  if (candidates.size === 0) {
    return {
      hits: [],
      cost: { embed: embedCost, rerank: 0, total: embedCost },
      tokensUsed: { embed: embedTokens, rerank: 0 },
      latencyMs: Date.now() - startedAt
    };
  }

  // ─── STEP 3: RRF fusion ─────────────────────────────────────────
  const vectorList = toRankedList(
    Array.from(candidates.values())
      .filter((c) => c.vectorScore !== undefined)
      .map((c) => ({ id: c.chunkId, score: c.vectorScore! }))
  );
  const bm25List = toRankedList(
    Array.from(candidates.values())
      .filter((c) => c.bm25Score !== undefined)
      .map((c) => ({ id: c.chunkId, score: c.bm25Score! }))
  );

  const fused = reciprocalRankFusion([vectorList, bm25List]).slice(0, DEFAULT_FUSED_TOP_K);

  // ─── STEP 4: Rerank top-K from fusion ────────────────────────────
  const fusedCandidates = fused
    .map((f) => candidates.get(f.id))
    .filter((c): c is HitCandidate => c !== undefined);

  const rerankProvider = getRerankProvider();
  const rerankResult = await rerankProvider.rerank({
    query: req.query,
    documents: fusedCandidates.map((c) => c.text),
    topN
  });
  _mark('rerank');

  // ─── STEP 5: Build hits with full metadata ──────────────────────
  const hits: SearchHit[] = await Promise.all(
    rerankResult.results.map(async (r) => {
      const cand = fusedCandidates[r.index];
      const meta = cand.metadata as PaperChunkMetadata;
      let pages: number[] = [];
      try {
        pages = meta.pagesJson ? JSON.parse(meta.pagesJson) : [];
      } catch {
        pages = [];
      }
      return {
        paperId: cand.paperId,
        chunkIdx: cand.chunkIdx,
        text: cand.text,
        pages,
        section: meta.section ?? '',
        paperTitle: meta.paperTitle ?? '',
        paperAuthors: meta.paperAuthors ?? [],
        paperYear: meta.paperYear ?? 0,
        paperDoi: meta.paperDoi ?? '',
        score: r.relevanceScore,
        vectorScore: cand.vectorScore ?? 0
      };
    })
  );

  // R188-4 phase1 (T-7): emit per-step timing for Phase 2 bottleneck analysis.
  // Filter Vercel logs by event=search_timing. Remove after root cause fixed.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: 'search_timing',
      tenantId: req.tenantId,
      candidateCount: candidates.size,
      totalMs: Date.now() - startedAt,
      marks: _marks
    })
  );

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

/**
 * BM25 retrieval — scores all chunks in tenant corpus, returns top-K.
 * Naive: O(n) chunks per query. For < 10K chunks acceptable (~100ms).
 * For 100K+ chunks, would need inverted index. Defer.
 */
async function retrieveBM25(
  tenantId: string,
  query: string,
  encoder: import('./sparse').BM25Encoder,
  topK: number
): Promise<{ chunkId: string; score: number; chunk: PaperChunkDoc }[]> {
  const db = getAdminFirestoreService();
  const papers = await db
    .collection(`tenants/${tenantId}/papers`)
    .where('status', '==', 'indexed')
    .get();

  const allChunks: { chunkId: string; chunk: PaperChunkDoc }[] = [];
  const excludedSet = new Set([
    'References',
    'REFERENCES',
    'Notes and references',
    'Bibliography',
    'Author contributions',
    'ASSOCIATED CONTENT',
    'Terms and Conditions'
  ]);
  for (const paper of papers.docs) {
    const chunks = await paper.ref.collection('chunks').get();
    for (const c of chunks.docs) {
      const data = c.data() as PaperChunkDoc;
      // Skip excluded sections
      if (data.section && excludedSet.has(data.section)) continue;
      allChunks.push({ chunkId: data.id, chunk: data });
    }
  }

  if (allChunks.length === 0) return [];

  const texts = allChunks.map((c) => c.chunk.text);
  const scores = encoder.score(query, texts);

  return allChunks
    .map((c, i) => ({ ...c, score: scores[i] }))
    .filter((c) => c.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topK);
}
