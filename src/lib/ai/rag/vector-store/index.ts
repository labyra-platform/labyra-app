/**
 * Vector store abstraction.
 * Currently: Pinecone only. Future: swap to Qdrant or pgvector if needed.
 * @phase R160-ai-5a
 */
import 'server-only';
import {
  pineconeUpsert,
  pineconeQuery,
  pineconeDeleteByPaperId,
  pineconeDeleteTenant,
  type UpsertVector,
  type PineconeQueryMatch,
  type PaperChunkMetadata
} from './pinecone';

export type VectorMetadata = PaperChunkMetadata;
export type VectorMatch = PineconeQueryMatch;
export type Vector = UpsertVector;

export interface VectorStore {
  readonly id: string;
  upsert(tenantId: string, vectors: Vector[]): Promise<void>;
  query(
    tenantId: string,
    embedding: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<VectorMatch[]>;
  deleteByPaperId(tenantId: string, paperId: string): Promise<void>;
  deleteTenant(tenantId: string): Promise<void>;
}

class PineconeStore implements VectorStore {
  readonly id = 'pinecone';
  upsert = pineconeUpsert;
  query = pineconeQuery;
  deleteByPaperId = pineconeDeleteByPaperId;
  deleteTenant = pineconeDeleteTenant;
}

let _store: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (_store) return _store;
  _store = new PineconeStore();
  return _store;
}
