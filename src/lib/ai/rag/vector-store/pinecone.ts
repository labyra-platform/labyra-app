/**
 * Pinecone client — namespace per tenant for multi-tenant isolation.
 * @phase R160-ai-5a
 *
 * Multi-tenancy pattern (Pinecone recommended for SaaS):
 *   - Single index 'labyra-papers'
 *   - One namespace per tenant: namespace = tenantId
 *   - Query cost: 1 RU per 1 GB of tenant's data (vs 100 RU if metadata filter on 100 tenants)
 */
import 'server-only';
import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';

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
}

function getClient(): Pinecone {
  if (_client) return _client;
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey || !apiKey.startsWith('pcsk_')) {
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
  if (vectors.length === 0) return;
  const index = getIndex();
  const ns = index.namespace(tenantId);
  // Batch in chunks of 100
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ns.upsert(batch as any);
  }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ns.deleteMany({ filter: { paperId } } as any);
}

/**
 * Delete entire tenant namespace (for tenant offboarding).
 */
export async function pineconeDeleteTenant(tenantId: string): Promise<void> {
  const index = getIndex();
  const ns = index.namespace(tenantId);
  await ns.deleteAll();
}
