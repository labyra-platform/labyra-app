/**
 * Indexing step — Upsert to Pinecone + persist chunks to Firestore.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getVectorStore } from '@/lib/ai/rag/vector-store';
import { invalidateBM25 } from '@/lib/ai/rag/sparse/bm25-manager';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Paper, PaperChunkDoc } from '@/types/papers';
import type { EmbeddedChunk } from './embed-step';
import { throwIfCancelled } from './state';

interface IndexStepInput {
  tenantId: string;
  paper: Pick<Paper, 'id' | 'title' | 'authors' | 'year' | 'doi' | 'groupId'>;
  chunks: EmbeddedChunk[];
  signal: AbortSignal;
}

export async function runIndexStep(input: IndexStepInput): Promise<number> {
  const { tenantId, paper, chunks, signal } = input;
  const db = getAdminFirestoreService();
  const vectorStore = getVectorStore();

  // 1. Persist chunks to Firestore (for BM25 + citation rendering)
  const batch = db.batch();
  for (const chunk of chunks) {
    throwIfCancelled(signal);
    const chunkDoc: PaperChunkDoc = {
      schemaVersion: 1,
      id: `${paper.id}-${chunk.chunkIdx}`,
      paperId: paper.id,
      chunkIdx: chunk.chunkIdx,
      text: chunk.text,
      contextualText: chunk.contextualText,
      pages: chunk.pages,
      section: chunk.section,
      tokens: chunk.tokens
    };
    const ref = db.doc(`tenants/${tenantId}/papers/${paper.id}/chunks/${chunkDoc.id}`);
    batch.set(ref, { ...chunkDoc, createdAt: Timestamp.now() });
  }
  await batch.commit();

  throwIfCancelled(signal);

  // 2. Upsert vectors to Pinecone (namespace = tenantId)
  const vectors = chunks.map((chunk) => ({
    id: `${paper.id}-${chunk.chunkIdx}`,
    values: chunk.embedding,
    metadata: {
      paperId: paper.id,
      chunkIdx: chunk.chunkIdx,
      text: chunk.text.slice(0, 1000),
      pagesJson: JSON.stringify(chunk.pages),
      section: chunk.section,
      // AI-9 fix: paper metadata fields may be undefined (incomplete extraction).
      // `paper.authors.length` crashes on undefined; Pinecone also rejects
      // undefined metadata values — provide concrete fallbacks for all.
      paperTitle: paper.title || 'Untitled',
      // Pinecone metadata: string[] must be non-empty
      paperAuthors: (paper.authors?.length ?? 0) > 0 ? paper.authors : ['unknown'],
      paperYear: paper.year ?? 0,
      paperDoi: paper.doi ?? '',
      // ADR-034 TEAM-5: group scope (mirrors worker index.py).
      groupId: paper.groupId
    }
  }));

  await vectorStore.upsert(tenantId, vectors);

  // AI-16: drop the cached BM25 encoder so the next search refits on the corpus
  // including this newly-indexed paper, instead of waiting up to the 1h cache TTL
  // (during which the new paper would be vector-only / absent from BM25).
  invalidateBM25(tenantId);

  return chunks.length;
}
