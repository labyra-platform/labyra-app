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

  const patch: Record<string, unknown> = { groupId, updatedAt: Date.now(), updatedBy: actor.uid };
  // R488: remember the origin group when going lab-wide, so unshare can restore it.
  if (groupId === 'lab-shared' && paper.groupId !== 'lab-shared') {
    patch.previousGroupId = paper.groupId;
  }
  await ref.update(patch);

  // Re-stamp vector metadata for each chunk (vector id === chunk doc id ===
  // `${paperId}-${chunkIdx}`). Sequential — papers have tens of chunks.
  const chunkSnaps = await ref.collection('chunks').get();
  for (const c of chunkSnaps.docs) {
    await pineconeUpdateMetadata(tenantId, c.id, { groupId });
  }

  return { ...paper, groupId };
}

/**
 * R488: stop sharing a paper lab-wide. Restores previousGroupId (recorded when
 * it was shared), else falls back to the actor's group. Idempotent when the
 * paper is not lab-shared. Throws 'no_group' when nothing can be restored.
 */
export async function unshareFromLab(
  tenantId: string,
  paperId: string,
  actor: ShareActor,
  fallbackGroupId: string | null
): Promise<Paper> {
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(paperId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('not_found');
  const paper = snap.data() as Paper;
  if (paper.groupId !== 'lab-shared') return paper;

  const restoreGroupId = paper.previousGroupId ?? fallbackGroupId;
  if (!restoreGroupId) throw new Error('no_group');
  return shareToGroup(tenantId, paperId, restoreGroupId, actor);
}
