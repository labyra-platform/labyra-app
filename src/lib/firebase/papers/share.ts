/**
 * Share a paper into a research group (ADR-034 TEAM-5).
 *
 * Sets the paper's groupId and re-stamps the groupId on every chunk's Pinecone
 * vector metadata, so vector RAG honours the new scope. BM25 reads groupId from
 * the paper doc at corpus-build time (bm25-manager), so no chunk-doc change is
 * needed there. Permission: the paper's uploader or an admin/superadmin.
 *
 * @phase R287
 */
import 'server-only';
import { pineconeUpdateMetadata } from '@/lib/ai/rag/vector-store/pinecone';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Paper } from '@/types/papers';

const COLLECTION = 'papers';

export interface ShareActor {
  uid: string;
  role: 'superadmin' | 'admin' | 'member' | 'viewer' | null;
}

export async function shareToGroup(
  tenantId: string,
  paperId: string,
  groupId: string,
  actor: ShareActor
): Promise<Paper> {
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(paperId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('not_found');
  const paper = snap.data() as Paper;

  const isAdmin = actor.role === 'admin' || actor.role === 'superadmin';
  const isOwner = paper.uploadedBy === actor.uid || paper.createdBy === actor.uid;
  if (!isOwner && !isAdmin) throw new Error('forbidden');

  if (paper.groupId === groupId) return paper; // already shared to this group

  await ref.update({ groupId, updatedAt: Date.now(), updatedBy: actor.uid });

  // Re-stamp vector metadata for each chunk (vector id === chunk doc id ===
  // `${paperId}-${chunkIdx}`). Sequential — papers have tens of chunks.
  const chunkSnaps = await ref.collection('chunks').get();
  for (const c of chunkSnaps.docs) {
    await pineconeUpdateMetadata(tenantId, c.id, { groupId });
  }

  return { ...paper, groupId };
}
