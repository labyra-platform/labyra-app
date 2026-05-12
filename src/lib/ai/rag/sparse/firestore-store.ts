/**
 * Persist BM25 params per-tenant in Firestore.
 * @phase R160-ai-5d-2
 *
 * Schema: tenants/{tenantId}/searchConfig/bm25
 *   { schemaVersion, totalDocs, avgDocLen, vocabSize, fittedAt, tokenizerId, vocabChunks }
 *
 * Vocab can be large (10K+ terms for 100 papers). Firestore doc limit 1MB.
 * Strategy: store metadata in main doc, vocab in subcollection chunks if > 500KB.
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { BM25Params } from './types';

export interface PersistedBM25State {
  params: BM25Params;
  vocab: string[];
}

const VOCAB_CHUNK_SIZE = 5000; // tokens per chunk

export async function saveBM25State(tenantId: string, state: PersistedBM25State): Promise<void> {
  const db = getAdminFirestoreService();
  const cfgRef = db.doc(`tenants/${tenantId}/searchConfig/bm25`);

  // Save params (small)
  await cfgRef.set({
    ...state.params,
    updatedAt: Timestamp.now()
  });

  // Delete old vocab chunks
  const oldChunks = await cfgRef.collection('vocabChunks').get();
  if (!oldChunks.empty) {
    const batch = db.batch();
    oldChunks.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Save vocab in chunks
  const numChunks = Math.ceil(state.vocab.length / VOCAB_CHUNK_SIZE);
  for (let i = 0; i < numChunks; i++) {
    const slice = state.vocab.slice(i * VOCAB_CHUNK_SIZE, (i + 1) * VOCAB_CHUNK_SIZE);
    await cfgRef
      .collection('vocabChunks')
      .doc(String(i))
      .set({
        idx: i,
        tokens: slice,
        offset: i * VOCAB_CHUNK_SIZE
      });
  }
}

export async function loadBM25State(tenantId: string): Promise<PersistedBM25State | null> {
  const db = getAdminFirestoreService();
  const cfgRef = db.doc(`tenants/${tenantId}/searchConfig/bm25`);
  const snap = await cfgRef.get();
  if (!snap.exists) return null;

  const params = snap.data() as BM25Params;

  // Load vocab chunks
  const chunks = await cfgRef.collection('vocabChunks').orderBy('idx').get();

  const vocab: string[] = [];
  chunks.docs.forEach((d) => {
    const data = d.data() as { tokens: string[] };
    vocab.push(...data.tokens);
  });

  return { params, vocab };
}

export async function deleteBM25State(tenantId: string): Promise<void> {
  const db = getAdminFirestoreService();
  const cfgRef = db.doc(`tenants/${tenantId}/searchConfig/bm25`);
  const chunks = await cfgRef.collection('vocabChunks').get();
  const batch = db.batch();
  chunks.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(cfgRef);
  await batch.commit();
}
