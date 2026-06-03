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

interface CachedEntry {
  encoder: BM25Encoder;
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
export async function getBM25ForTenant(tenantId: string): Promise<BM25Encoder | null> {
  const cache = getCache();
  const cached = cache.get(tenantId);

  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.encoder;
  }

  // Try load from Firestore
  const state = await loadBM25State(tenantId);
  if (state) {
    // Existing params — refit on current corpus to rebuild internal vectorizer
    const corpus = await getCorpus(tenantId);
    if (corpus.length === 0) {
      return null;
    }
    const encoder = new BM25Encoder(getHybridTokenizer());
    await encoder.fit(corpus);
    cache.set(tenantId, { encoder, loadedAt: Date.now(), corpusSize: corpus.length });
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
 * Fetch all chunks for a tenant (for fitting BM25).
 */
async function getCorpus(tenantId: string): Promise<string[]> {
  const db = getAdminFirestoreService();
  const papers = await db
    .collection(`tenants/${tenantId}/papers`)
    .where('status', '==', 'indexed')
    .get();

  const corpus: string[] = [];
  // R238c: parallelize per-paper chunk reads (was a serial N+1 — one RTT/paper).
  const chunkSnaps = await mapWithConcurrency(papers.docs, CHUNK_FETCH_CONCURRENCY, (paperDoc) =>
    paperDoc.ref.collection('chunks').get()
  );
  for (const chunks of chunkSnaps) {
    for (const chunk of chunks.docs) {
      const data = chunk.data() as PaperChunkDoc;
      // Contextual Retrieval: index the context-prepended text so the sparse
      // (BM25) side benefits from enrichment the same way the dense embedding
      // does. Falls back to raw text when enrichment is off (contextualText
      // empty), so this is a no-op until ENABLE_ENRICHMENT is turned on.
      const text = data.contextualText || data.text;
      if (text) corpus.push(text);
    }
  }
  return corpus;
}

/**
 * Refit BM25 for tenant on current corpus.
 * Used by: cold start, daily cron, manual refit.
 */
export async function refitTenant(tenantId: string): Promise<BM25Encoder | null> {
  const corpus = await getCorpus(tenantId);
  if (corpus.length === 0) {
    return null;
  }

  const encoder = new BM25Encoder(getHybridTokenizer());
  await encoder.fit(corpus);

  const params = encoder.getParams();
  if (!params) return null;

  await saveBM25State(tenantId, {
    params,
    vocab: encoder.getVocab()
  });

  const cache = getCache();
  cache.set(tenantId, { encoder, loadedAt: Date.now(), corpusSize: corpus.length });

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
