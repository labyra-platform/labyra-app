/**
 * Pinecone client — namespace per tenant for multi-tenant isolation.
 * @phase R160-ai-5a
 *
 * Multi-tenancy pattern (Pinecone recommended for SaaS):
 *   - Single index 'labyra-papers'
 *   - One namespace per tenant: namespace = tenantId
 *   - Query cost: 1 RU per 1 GB of tenant's data (vs 100 RU if metadata filter on 100 tenants)
 */
// R165-phase-1-oxlint: oxlint cleanup
import 'server-only';
import { type Index, Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';

let _client: Pinecone | null = null;
let _index: Index<PaperChunkMetadata> | null = null;

// Pinecone metadata values must be: string | number | boolean | string[]
// No undefined allowed → use empty string/0 for missing data
export interface PaperChunkMetadata extends RecordMetadata {
  paperId: string;
  chunkIdx: number;
  text: string;
  /** JSON-stringified number[] — Pinecone doesn't support number arrays in metadata */
  pagesJson: string;
  /** Section heading or empty string */
  section: string;
  paperTitle: string;
  paperAuthors: string[];
  /** Publication year, 0 if unknown */
  paperYear: number;
  /** DOI or empty string */
  paperDoi: string;
  /**
   * ADR-034 TEAM-5: research group for KB isolation. 'lab-shared' = visible to
   * all groups; a real groupId scopes the chunk to that group. Worker writes
   * this from the paper doc (index.py _build_metadata). Query-time filter: B4.
   */
  groupId: string;
}

function getClient(): Pinecone {
  if (_client) return _client;
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey?.startsWith('pcsk_')) {
    throw new Error('PINECONE_API_KEY missing or malformed (expected pcsk_...). Set in .env.local');
  }
  _client = new Pinecone({ apiKey });
  return _client;
}

function getIndex(): Index<PaperChunkMetadata> {
  if (_index) return _index;
  const indexName = process.env.PINECONE_INDEX_NAME ?? 'labyra-papers';
  _index = getClient().index<PaperChunkMetadata>(indexName);
  return _index;
}

export interface UpsertVector {
  id: string;
  values: number[];
  metadata: PaperChunkMetadata;
}

/**
 * Upsert vectors into tenant's namespace.
 * Batch size: Pinecone recommends ≤100 vectors per call.
 */
export async function pineconeUpsert(tenantId: string, vectors: UpsertVector[]): Promise<void> {
  if (vectors.length === 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'pinecone_upsert_empty',
        tenantId
      })
    );
    return;
  }
  const index = getIndex();
  const ns = index.namespace(tenantId);

  // Validate first vector to catch malformed data early
  const v0 = vectors[0];
  // eslint-disable-next-line no-console -- structured logging for audit
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'pinecone_upsert_start',
      tenantId,
      count: vectors.length,
      sampleId: v0.id,
      valuesLen: v0.values?.length,
      valuesType: typeof v0.values,
      valuesIsArray: Array.isArray(v0.values),
      firstValue: v0.values?.[0],
      metadataKeys: Object.keys(v0.metadata ?? {}),
      paperAuthorsLen: v0.metadata?.paperAuthors?.length
    })
  );

  // Batch in chunks of 100
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ns.upsert({ records: batch } as any);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'pinecone_upsert_batch_failed',
          batchIdx: i,
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
          firstVectorId: batch[0]?.id,
          firstVectorValuesLen: batch[0]?.values?.length
        })
      );
      throw err;
    }
  }
}

/* ─── Translation Memory (ADR-045 Tier 4, R237bk) ─────────────────────────────
 * Source→target pairs from past translations, stored in a SEPARATE namespace
 * (tm__<tenantId>) of the same index so they never mix with paper chunks. Same
 * embedding model/dimension, so the index is shared. Failures are swallowed —
 * TM is an optional quality booster and must never break translation. */
export interface TmMetadata extends RecordMetadata {
  source: string;
  translation: string;
  lang: string;
}
export interface TmUpsertVector {
  id: string;
  values: number[];
  metadata: TmMetadata;
}
export interface TmQueryMatch {
  id: string;
  score: number;
  metadata: TmMetadata;
}
const tmNamespace = (tenantId: string) => `tm__${tenantId}`;

export async function tmUpsert(tenantId: string, vectors: TmUpsertVector[]): Promise<void> {
  if (vectors.length === 0) return;
  const ns = getIndex().namespace(tmNamespace(tenantId));
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ns.upsert({ records: batch } as any);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'tm_upsert_failed',
          tenantId,
          error: err instanceof Error ? err.message : String(err)
        })
      );
      // swallow — never break translation
    }
  }
}

export async function tmQuery(
  tenantId: string,
  vector: number[],
  topK: number,
  filter?: Record<string, unknown>
): Promise<TmQueryMatch[]> {
  const ns = getIndex().namespace(tmNamespace(tenantId));
  const result = await ns.query({
    vector,
    topK,
    includeMetadata: true,
    ...(filter ? { filter } : {})
  });
  return (result.matches ?? [])
    .filter((m) => m.metadata !== undefined && m.score !== undefined)
    .map((m) => ({
      id: m.id,
      score: m.score!,
      metadata: m.metadata as unknown as TmMetadata
    }));
}

export interface PineconeQueryMatch {
  id: string;
  score: number;
  metadata: PaperChunkMetadata;
}

/**
 * Query top-K vectors in tenant's namespace.
 */
export async function pineconeQuery(
  tenantId: string,
  vector: number[],
  topK: number,
  filter?: Record<string, unknown>
): Promise<PineconeQueryMatch[]> {
  const index = getIndex();
  const ns = index.namespace(tenantId);
  const result = await ns.query({
    vector,
    topK,
    includeMetadata: true,
    ...(filter ? { filter } : {})
  });

  return (result.matches ?? [])
    .filter((m) => m.metadata !== undefined && m.score !== undefined)
    .map((m) => ({
      id: m.id,
      score: m.score!,
      metadata: m.metadata as PaperChunkMetadata
    }));
}

/**
 * Delete all chunks for a specific paper in tenant's namespace.
 */
export async function pineconeDeleteByPaperId(tenantId: string, paperId: string): Promise<void> {
  const index = getIndex();
  const ns = index.namespace(tenantId);
  // Pinecone serverless: delete by metadata filter
  // 404 returned when namespace is empty — treat as no-op
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ns.deleteMany({ filter: { paperId } } as any);
  } catch (err) {
    const errName = (err as { name?: string }).name;
    if (errName === 'PineconeNotFoundError') return;
    throw err;
  }
}

/**
 * Update metadata on a single existing vector (no re-embed).
 *
 * ADR-034 TEAM-5: used by the groupId backfill to stamp group scope onto
 * already-indexed chunks without recomputing embeddings. Pinecone applies a
 * partial metadata merge for the given id within the tenant namespace.
 *
 * @param id  vector id = `${paperId}-${chunkIdx}` (worker convention)
 */
export async function pineconeUpdateMetadata(
  tenantId: string,
  id: string,
  metadata: Partial<PaperChunkMetadata>
): Promise<void> {
  const index = getIndex();
  const ns = index.namespace(tenantId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ns.update({ id, metadata } as any);
}

/**
 * Delete entire tenant namespace (for tenant offboarding).
 */
export async function pineconeDeleteTenant(tenantId: string): Promise<void> {
  const index = getIndex();
  const ns = index.namespace(tenantId);
  await ns.deleteAll();
}
