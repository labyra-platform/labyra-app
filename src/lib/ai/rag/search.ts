/**
 * searchPapers — hybrid retrieval (vector + BM25 + RRF + rerank).
 * @phase R160-ai-5d-2 (upgraded from ai-5d-1 vector+rerank only)
 */
import 'server-only';
import { resolveCollectionPaperIds } from './collection-scope';
import { getEmbeddingProvider } from './embedding';
import { reciprocalRankFusion, toRankedList } from './fusion/rrf';
import { getRerankProvider } from './rerank';
import type { SearchHit, SearchRequest, SearchResponse } from './search-types';
import { getBM25ForTenant, getBM25Corpus, type BM25ChunkLite } from './sparse/bm25-manager';
import { getVectorStore } from './vector-store';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { PaperChunkMetadata } from './vector-store/pinecone';

const DEFAULT_VECTOR_TOP_K = 20;
const DEFAULT_BM25_TOP_K = 20;
const DEFAULT_FUSED_TOP_K = 20;
const DEFAULT_TOP_N = 5;
// ADR-033 T-4: BM25 fail-soft budget. The scan-all-chunks path is the slow one
// at scale; beyond this, fall back to vector-only instead of timing out search.
const BM25_TIMEOUT_MS = 5000;

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

/**
 * R286 (B2): return the subset of paperIds whose paper must be EXCLUDED from
 * retrieval — deprecated/retracted (lifecycleStatus !== 'active') or a DOI
 * duplicate (status === 'duplicate'). One batched read; missing docs are not
 * excluded (fail-open so a transient read miss never blanks search).
 */
async function findExcludedPaperIds(tenantId: string, paperIds: string[]): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (paperIds.length === 0) return excluded;
  const db = getAdminFirestoreService();
  const refs = paperIds.map((id) =>
    db.collection('tenants').doc(tenantId).collection('papers').doc(id)
  );
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() as { lifecycleStatus?: string; status?: string };
    const inactive = data.lifecycleStatus !== undefined && data.lifecycleStatus !== 'active';
    if (inactive || data.status === 'duplicate') {
      excluded.add(snap.id);
    }
  }
  return excluded;
}

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

  // R-collection-2: optional collection scope. Resolve to member paperIds and
  // short-circuit an empty/missing collection before any embed or retrieval.
  // Gated on req.collectionId — callers that omit it keep identical behaviour.
  let collectionPaperIds: Set<string> | null = null;
  if (req.collectionId) {
    collectionPaperIds = new Set(await resolveCollectionPaperIds(req.tenantId, req.collectionId));
    if (collectionPaperIds.size === 0) {
      return {
        hits: [],
        cost: { embed: 0, rerank: 0, total: 0 },
        tokensUsed: { embed: 0, rerank: 0 },
        latencyMs: Date.now() - startedAt
      };
    }
  }

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
  // Merge user filter with section exclusion.
  // AI-7 fix: a spread `{ ...req.filter, section: {...} }` silently overwrites a
  // caller-provided `section` key. Build the constraint list and combine with $and
  // so every clause (user filter, section exclusion, group scope) always applies.
  const filterClauses: Record<string, unknown>[] = [{ section: { $nin: EXCLUDED_SECTIONS } }];
  if (req.filter && Object.keys(req.filter).length > 0) {
    filterClauses.push(req.filter);
  }
  // ADR-034 TEAM-5: group scope. Privileged viewers see all groups.
  if (!req.isPrivileged && req.viewerGroupId !== undefined) {
    filterClauses.push({ groupId: { $in: [req.viewerGroupId, 'lab-shared'] } });
  }
  // R-collection-2: restrict to the collection's member papers.
  if (collectionPaperIds) {
    filterClauses.push({ paperId: { $in: [...collectionPaperIds] } });
  }
  const mergedFilter: Record<string, unknown> = { $and: filterClauses };

  // R238c: run vector + BM25 retrieval concurrently (were sequential — BM25 was
  // added on top of vector latency). Each leg records its own mark on resolution
  // so per-leg timing stays observable.
  const vectorPromise = vectorStore
    .query(req.tenantId, queryVector, vectorTopK, mergedFilter)
    .then((matches) => {
      _mark('vector_query');
      return matches;
    });

  // BM25 retrieval (only if encoder available — may be null for new tenants).
  // Fail-soft (ADR-033 T-4): the BM25 path scans all chunks in the tenant, so at
  // scale it can dominate latency. Cap it with a timeout and fall back to
  // vector-only (≈70-80% quality) rather than letting a slow BM25 time out search.
  const bm25HitsPromise: Promise<{ chunkId: string; score: number; chunk: BM25ChunkLite }[]> =
    bm25Encoder
      ? (async () => {
          let bm25Timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const hits = await Promise.race([
              retrieveBM25(
                req.tenantId,
                req.query,
                bm25Encoder,
                DEFAULT_BM25_TOP_K,
                req.viewerGroupId,
                req.isPrivileged,
                collectionPaperIds
              ),
              new Promise<never>((_resolve, reject) => {
                bm25Timer = setTimeout(() => reject(new Error('bm25_timeout')), BM25_TIMEOUT_MS);
              })
            ]);
            _mark('bm25_retrieve');
            return hits;
          } catch (err) {
            console.warn(
              JSON.stringify({
                level: 'warn',
                event: 'bm25_failsoft',
                tenantId: req.tenantId,
                error: err instanceof Error ? err.message : String(err)
              })
            );
            return []; // vector-only fallback
          } finally {
            if (bm25Timer) clearTimeout(bm25Timer);
          }
        })()
      : Promise.resolve<{ chunkId: string; score: number; chunk: BM25ChunkLite }[]>([]);

  const [vectorMatches, bm25Hits] = await Promise.all([vectorPromise, bm25HitsPromise]);

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
  const fusedCandidatesRaw = fused
    .map((f) => candidates.get(f.id))
    .filter((c): c is HitCandidate => c !== undefined);
  // R286 (B2): drop chunks whose paper is deprecated/retracted or a DOI duplicate
  // (post-fusion, pre-rerank — rerank never sees them; vectors are NOT deleted).
  const excludedPaperIds = await findExcludedPaperIds(
    req.tenantId,
    Array.from(new Set(fusedCandidatesRaw.map((c) => c.paperId)))
  );
  const fusedCandidates = fusedCandidatesRaw.filter((c) => !excludedPaperIds.has(c.paperId));
  _mark('paper_status_filter');

  // AI-6 fix: if fusion produced no usable candidates, skip rerank entirely —
  // reranking an empty document list then indexing by result index crashes.
  if (fusedCandidates.length === 0) {
    return {
      hits: [],
      cost: { embed: embedCost, rerank: 0, total: embedCost },
      tokensUsed: { embed: embedTokens, rerank: 0 },
      latencyMs: Date.now() - startedAt
    };
  }

  const rerankProvider = getRerankProvider();
  const rerankResult = await rerankProvider.rerank({
    query: req.query,
    documents: fusedCandidates.map((c) => c.text),
    topN
  });
  _mark('rerank');

  // ─── STEP 5: Build hits with full metadata ──────────────────────
  const hits: SearchHit[] = (
    await Promise.all(
      rerankResult.results.map(async (r) => {
        // AI-6 fix: rerank may return an index ≥ fusedCandidates.length (provider
        // quirk / topN mismatch). Guard before access or `cand.metadata` crashes.
        const cand = fusedCandidates[r.index];
        if (!cand) {
          // eslint-disable-next-line no-console -- diagnostic for OOB rerank index
          console.warn(
            `[rag/search] rerank index ${r.index} out of bounds (have ${fusedCandidates.length}); skipping`
          );
          return null;
        }
        const meta = cand.metadata as PaperChunkMetadata;
        let pages: number[] = [];
        try {
          pages = meta.pagesJson ? JSON.parse(meta.pagesJson) : [];
        } catch {
          // AI-20 fix: don't swallow silently — a malformed pagesJson hides a
          // bad index write; log so it can be traced.
          // eslint-disable-next-line no-console -- diagnostic for bad metadata
          console.warn(
            `[rag/search] failed to parse pagesJson for paper ${cand.paperId} chunk ${cand.chunkIdx}`
          );
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
    )
  ).filter((h): h is SearchHit => h !== null);

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
    latencyMs: Date.now() - startedAt,
    marks: _marks
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
  topK: number,
  viewerGroupId?: string | null,
  isPrivileged?: boolean,
  collectionPaperIds?: Set<string> | null
): Promise<{ chunkId: string; score: number; chunk: BM25ChunkLite }[]> {
  // Corpus is cached alongside the encoder (built once), so this no longer
  // re-reads every chunk from Firestore on each query — the prior hot-path cost.
  const corpus = await getBM25Corpus(tenantId);
  if (corpus.length === 0) return [];

  const excludedSet = new Set([
    'References',
    'REFERENCES',
    'Notes and references',
    'Bibliography',
    'Author contributions',
    'ASSOCIATED CONTENT',
    'Terms and Conditions'
  ]);

  const scoped = corpus.filter((e) => {
    // ADR-034 group scope (in-memory, mirrors the previous Firestore filter).
    if (!isPrivileged && viewerGroupId !== undefined) {
      if (e.groupId !== viewerGroupId && e.groupId !== 'lab-shared') return false;
    }
    // R-collection-2 collection scope.
    if (collectionPaperIds != null && !collectionPaperIds.has(e.paperId)) return false;
    // Skip excluded (non-content) sections.
    if (e.chunk.section && excludedSet.has(e.chunk.section)) return false;
    return true;
  });

  if (scoped.length === 0) return [];

  // R251: score against precomputed doc vectors (built once at fit) instead of
  // re-encoding every chunk per query — the prior ~10s hot-path cost. Falls back
  // to live re-encoding only for entries missing a precomputed vec.
  const needsEncode = scoped.some((e) => e.vec === undefined);
  const scores = needsEncode
    ? encoder.score(
        query,
        scoped.map((e) => e.scoreText)
      )
    : encoder.scorePreEncoded(
        query,
        scoped.map((e) => e.vec as import('./sparse').SparseVector)
      );

  return scoped
    .map((e, i) => ({ chunkId: e.chunkId, score: scores[i], chunk: e.chunk }))
    .filter((c) => c.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, topK);
}
