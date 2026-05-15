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
import { BM25Encoder } from './bm25';
import { getHybridTokenizer } from './hybrid-tokenizer';
import { loadBM25State, saveBM25State } from './firestore-store';
import type { PaperChunkDoc } from '@/types/papers';

interface CachedEntry {
  encoder: BM25Encoder;
  loadedAt: number;
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
    cache.set(tenantId, { encoder, loadedAt: Date.now() });
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
  for (const paperDoc of papers.docs) {
    const chunks = await paperDoc.ref.collection('chunks').get();
    for (const chunk of chunks.docs) {
      const data = chunk.data() as PaperChunkDoc;
      if (data.text) corpus.push(data.text);
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
  cache.set(tenantId, { encoder, loadedAt: Date.now() });

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
