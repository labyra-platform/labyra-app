/**
 * Paper service: CRUD + metadata updates + versioning sub-collection.
 *
 * Path: tenants/{tenantId}/papers/{paperId}
 * Versions: tenants/{tenantId}/papers/{paperId}/versions/{vId}
 *
 * Note: Paper CREATE is currently handled by /api/papers/upload (multipart).
 * This service provides metadata UPDATE + read + lifecycle. Phase 12 may
 * unify the create path.
 *
 * @phase R164-phase-3c
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { buildDeprecatePatch, buildReactivatePatch, buildRetractPatch } from '@/lib/prov/lifecycle';
import type { UpdatePaperMetadataInput } from '@/lib/schemas/paper-schema';
import type { Paper, PaperVersion } from '@/types/papers';
import type { LifecycleStatus } from '@/types/prov-base';

const COLLECTION = 'papers';
const VERSIONS_SUB = 'versions';

export async function getPaper(tenantId: string, id: string): Promise<Paper | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Paper;
}

export interface ListPapersOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  status?: string;
  limit?: number;
  /**
   * ADR-034 TEAM-4a: KB group scope. When set (and not privileged), only papers
   * with groupId === viewerGroupId OR 'lab-shared' are returned. Filtered
   * in-memory (Firestore forbids a 2nd 'in' alongside lifecycleStatus).
   */
  viewerGroupId?: string | null;
  /** admin/superadmin → see all groups (cross-group visibility). */
  isPrivileged?: boolean;
}

export async function listPapers(tenantId: string, opts: ListPapersOptions = {}): Promise<Paper[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.status) q = q.where('status', '==', opts.status);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  let papers = snap.docs.map((d) => d.data() as Paper);

  // ADR-034 TEAM-4a: group scope (in-memory). Privileged viewers see all.
  if (!opts.isPrivileged && opts.viewerGroupId !== undefined) {
    const vg = opts.viewerGroupId;
    papers = papers.filter((p) => p.groupId === 'lab-shared' || p.groupId === vg);
  }
  return papers;
}

interface UpdatePaperContext {
  tenantId: string;
  updatedBy: string;
  changeNote?: string;
}

/**
 * Update paper metadata + snapshot prior state to versions sub-collection.
 *
 * Versioning steps:
 *   1. Read current doc (must exist)
 *   2. Write snapshot to versions/v{currentVersion}_{timestamp}
 *   3. Increment currentVersion
 *   4. Apply patch to top-level doc
 */
export async function updatePaperMetadata(
  id: string,
  patch: UpdatePaperMetadataInput,
  ctx: UpdatePaperContext
): Promise<Paper | null> {
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id);

  return db.runTransaction(async (tx) => {
    const before = await tx.get(ref);
    if (!before.exists) return null;
    const current = before.data() as Paper;

    // Snapshot to versions sub-collection
    const now = Date.now();
    const vId = `v${current.currentVersion}_${now}`;
    const versionDoc: PaperVersion = {
      id: vId,
      version: current.currentVersion,
      content: current,
      changedBy: ctx.updatedBy,
      changedAt: now,
      changeNote: ctx.changeNote
    };
    tx.set(ref.collection(VERSIONS_SUB).doc(vId), versionDoc);

    // Apply patch + bump currentVersion
    tx.update(ref, {
      ...patch,
      currentVersion: current.currentVersion + 1,
      updatedAt: now,
      updatedBy: ctx.updatedBy
    });

    return {
      ...current,
      ...patch,
      currentVersion: current.currentVersion + 1,
      updatedAt: now,
      updatedBy: ctx.updatedBy
    } as Paper;
  });
}

/**
 * List versions sub-collection for a paper, ordered by version desc.
 */
export async function listPaperVersions(
  tenantId: string,
  paperId: string
): Promise<PaperVersion[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(paperId)
    .collection(VERSIONS_SUB)
    .orderBy('version', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as PaperVersion);
}

export async function deprecatePaper(
  id: string,
  tenantId: string,
  userId: string,
  reason?: string
): Promise<void> {
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(buildDeprecatePatch(userId, { reason }));
}

export async function retractPaper(
  id: string,
  tenantId: string,
  userId: string,
  reason: string
): Promise<void> {
  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(buildRetractPatch(userId, { reason }));
}

export async function reactivatePaper(id: string, tenantId: string, userId: string): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const status = doc.data()?.lifecycleStatus as LifecycleStatus;
  if (status === 'retracted') {
    throw new Error('Cannot reactivate retracted paper (immutable per compliance)');
  }
  await ref.update(buildReactivatePatch(userId));
}

/**
 * Find papers by DOI (used by Reference creation to link to Paper).
 */
export async function findPaperByDoi(tenantId: string, doi: string): Promise<Paper | null> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('doi', '==', doi)
    .where('lifecycleStatus', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]?.data() as Paper;
}
