/**
 * BM25 manager — per-tenant lazy load + in-memory cache.
 * @phase R160-ai-5d-2
 *
 * Strategy:
 * - First search request after server start: load BM25 state from Firestore
 * - Cache in memory (globalThis to survive module isolation)
 * - Cache TTL: 1h (then reload from Firestore)
 * - On cold start (no state + ≥3 papers indexed): trigger immediate fit
 */
// R165-phase-1-oxlint: oxlint cleanup
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { mapWithConcurrency } from '@/lib/utils/concurrency';
import type { PaperChunkDoc } from '@/types/papers';
import { BM25Encoder } from './bm25';
import { loadBM25State, saveBM25State } from './firestore-store';
import { getHybridTokenizer } from './hybrid-tokenizer';
import type { SparseVector } from './types';

/** Slim chunk shape — only the fields search.ts reads off a BM25 hit. */
export interface BM25ChunkLite {
  paperId: string;
  chunkIdx: number;
  text: string;
  pages: number[];
  section: string;
}

export interface BM25CorpusEntry {
  chunkId: string;
  paperId: string;
  groupId: string;
  /** contextualText || text — used for BOTH fit and scoring (R318 consistency) */
  scoreText: string;
  chunk: BM25ChunkLite;
  /** R251: doc vector precomputed once at fit so per-query scoring skips re-encoding */
  vec?: SparseVector;
}

interface CachedEntry {
  encoder: BM25Encoder;
  /** corpus cached with the encoder so per-query retrieval needs no Firestore read */
  corpus: BM25CorpusEntry[];
  loadedAt: number;
  corpusSize: number;
}

type GlobalCache = {
  __labyraBM25Cache?: Map<string, CachedEntry>;
};

function getCache(): Map<string, CachedEntry> {
  const g = globalThis as unknown as GlobalCache;
  if (!g.__labyraBM25Cache) {
    g.__labyraBM25Cache = new Map();
  }
  return g.__labyraBM25Cache;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const COLD_START_MIN_PAPERS = 3;
// R238c: cap concurrent per-paper chunk reads so a large tenant doesn't fire
// hundreds of simultaneous Firestore round-trips at once.
const CHUNK_FETCH_CONCURRENCY = 25;

/**
 * AI-16: invalidate a tenant's cached BM25 encoder. Call after a paper finishes
 * indexing so newly-added documents become searchable immediately instead of
 * waiting up to CACHE_TTL_MS (1h) for the cache to expire and refit. Without
 * this, papers indexed within the TTL window are vector-only until expiry.
 */
export function invalidateBM25(tenantId: string): void {
  getCache().delete(tenantId);
}

/**
 * Get fitted BM25 encoder for tenant. Lazy load from Firestore,
 * or trigger cold-start fit if no params yet but corpus available.
 */
export async function getBM25ForTenant(
  tenantId: string,
  paperId?: string
): Promise<BM25Encoder | null> {
  const cacheKey = paperId ? `${tenantId}:${paperId}` : tenantId;
  const cache = getCache();
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.encoder;
  }

  // Paper-scoped fast path: fit BM25 on just this paper's chunks. Loading one
  // paper + fitting is ~1-2s (vs 60s+ for the whole tenant corpus on a cold
  // serverless instance), and local IDF is sufficient for ranking within a
  // single paper — which is all paper Q&A needs.
  if (paperId) {
    const t0 = Date.now();
    const corpus = await getCorpus(tenantId, paperId);
    if (corpus.length === 0) {
      console.warn(
        JSON.stringify({
          event: 'bm25_load',
          scope: 'paper',
          paperId,
          corpusSize: 0,
          ms: Date.now() - t0
        })
      );
      return null;
    }
    const encoder = new BM25Encoder(getHybridTokenizer());
    await encoder.fit(corpus.map((e) => e.scoreText));
    precomputeCorpusVecs(encoder, corpus);
    cache.set(cacheKey, { encoder, corpus, loadedAt: Date.now(), corpusSize: corpus.length });
    console.warn(
      JSON.stringify({
        event: 'bm25_load',
        scope: 'paper',
        paperId,
        corpusSize: corpus.length,
        ms: Date.now() - t0
      })
    );
    return encoder;
  }

  // Try load from Firestore
  const tTenant = Date.now();
  const state = await loadBM25State(tenantId);
  if (state) {
    // Existing params — refit on current corpus to rebuild internal vectorizer
    const corpus = await getCorpus(tenantId);
    if (corpus.length === 0) {
      return null;
    }
    const encoder = new BM25Encoder(getHybridTokenizer());
    await encoder.fit(corpus.map((e) => e.scoreText));
    precomputeCorpusVecs(encoder, corpus);
    cache.set(tenantId, { encoder, corpus, loadedAt: Date.now(), corpusSize: corpus.length });
    console.warn(
      JSON.stringify({
        event: 'bm25_load',
        scope: 'tenant',
        corpusSize: corpus.length,
        ms: Date.now() - tTenant
      })
    );
    return encoder;
  }

  // Cold start: check if enough corpus to fit
  const corpus = await getCorpus(tenantId);
  if (corpus.length < COLD_START_MIN_PAPERS) {
    return null; // not enough docs yet
  }

  // Trigger cold-start fit
  return refitTenant(tenantId);
}

/**
 * Fetch all indexed chunks for a tenant as structured corpus entries. Pairs
 * each chunk with its parent paper's id + groupId (for in-memory scoping at
 * query time) and carries scoreText (contextualText||text) used for both
 * fitting and scoring so the sparse side is consistent (R318).
 */
async function getCorpus(tenantId: string, paperId?: string): Promise<BM25CorpusEntry[]> {
  const db = getAdminFirestoreService();

  // Single-paper scope (paper Q&A): read just this paper's chunks. ~1-2s vs 60s+
  // for the whole tenant corpus on a cold serverless instance.
  if (paperId) {
    const paperRef = db.collection(`tenants/${tenantId}/papers`).doc(paperId);
    const [paperSnap, chunkSnap] = await Promise.all([
      paperRef.get(),
      paperRef.collection('chunks').get()
    ]);
    if (!paperSnap.exists) return [];
    const groupId = ((paperSnap.data()?.groupId as string | undefined) ?? '').trim();
    const scoped: BM25CorpusEntry[] = [];
    for (const chunk of chunkSnap.docs) {
      const data = chunk.data() as PaperChunkDoc;
      const scoreText = data.contextualText || data.text;
      if (!scoreText) continue;
      scoped.push({
        chunkId: data.id,
        paperId,
        groupId,
        scoreText,
        chunk: {
          paperId,
          chunkIdx: data.chunkIdx,
          text: data.text,
          pages: data.pages ?? [],
          section: data.section ?? ''
        }
      });
    }
    return scoped;
  }

  const papers = await db
    .collection(`tenants/${tenantId}/papers`)
    .where('status', '==', 'indexed')
    .get();

  // R238c: parallelize per-paper chunk reads. Snaps come back in papers.docs order.
  const chunkSnaps = await mapWithConcurrency(papers.docs, CHUNK_FETCH_CONCURRENCY, (paperDoc) =>
    paperDoc.ref.collection('chunks').get()
  );

  const corpus: BM25CorpusEntry[] = [];
  for (let i = 0; i < papers.docs.length; i += 1) {
    const paper = papers.docs[i];
    const groupId = ((paper.data().groupId as string | undefined) ?? '').trim();
    for (const chunk of chunkSnaps[i].docs) {
      const data = chunk.data() as PaperChunkDoc;
      const scoreText = data.contextualText || data.text;
      if (!scoreText) continue;
      corpus.push({
        chunkId: data.id,
        paperId: paper.id,
        groupId,
        scoreText,
        chunk: {
          paperId: paper.id,
          chunkIdx: data.chunkIdx,
          text: data.text,
          pages: data.pages ?? [],
          section: data.section ?? ''
        }
      });
    }
  }
  return corpus;
}

/**
 * Refit BM25 for tenant on current corpus.
 * Used by: cold start, daily cron, manual refit.
 */
/** R251: encode each corpus doc once so per-query scoring skips re-encoding. */
function precomputeCorpusVecs(encoder: BM25Encoder, corpus: BM25CorpusEntry[]): void {
  for (const e of corpus) {
    e.vec = encoder.encode(e.scoreText);
  }
}

export async function refitTenant(tenantId: string): Promise<BM25Encoder | null> {
  const corpus = await getCorpus(tenantId);
  if (corpus.length === 0) {
    return null;
  }

  const encoder = new BM25Encoder(getHybridTokenizer());
  await encoder.fit(corpus.map((e) => e.scoreText));
  precomputeCorpusVecs(encoder, corpus);

  const params = encoder.getParams();
  if (!params) return null;

  await saveBM25State(tenantId, {
    params,
    vocab: encoder.getVocab()
  });

  const cache = getCache();
  cache.set(tenantId, { encoder, corpus, loadedAt: Date.now(), corpusSize: corpus.length });

  // eslint-disable-next-line no-console -- structured logging for audit
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'bm25_refitted',
      tenantId,
      totalDocs: params.totalDocs,
      vocabSize: params.vocabSize,
      avgDocLen: Math.round(params.avgDocLen)
    })
  );

  return encoder;
}

/** Invalidate cache for a tenant (after refit) */
export function invalidateCache(tenantId: string): void {
  getCache().delete(tenantId);
}

/**
 * Cached corpus for a tenant (built + cached alongside the encoder). Ensures the
 * encoder/corpus are loaded/fresh, then returns the in-memory corpus so per-query
 * BM25 retrieval needs no Firestore read.
 */
export async function getBM25Corpus(tenantId: string): Promise<BM25CorpusEntry[]> {
  await getBM25ForTenant(tenantId);
  return getCache().get(tenantId)?.corpus ?? [];
}
