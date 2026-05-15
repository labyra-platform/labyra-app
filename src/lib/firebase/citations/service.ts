/**
 * Citation service: CRUD + lineage queries + stats.
 *
 * Path: tenants/{tenantId}/citations/{id}
 * Stats: tenants/{tenantId}/papers/{paperId}/_stats
 *
 * Citation ID is deterministic for dedup:
 *   {sourcePaperId}:d:{sha256(doi).slice(0,8)}    — when DOI present
 *   {sourcePaperId}:t:{sha256(title).slice(0,8)}  — when title only
 *
 * @phase R166-ai6a-2
 * @see docs/adr/ADR-017-citation-network.md
 */
// R166-ai6a-2-fix: lifecycle call signatures fixed
import 'server-only';
import crypto from 'node:crypto';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { buildDeprecatePatch, buildRetractPatch, buildReactivatePatch } from '@/lib/prov/lifecycle';
import type { Citation, PaperCitationStats } from '@/types/citations';
import type { LifecycleStatus } from '@/types/prov-base';
import type { CitationCreateInput, CitationPatch } from '@/lib/schemas/citation-schema';

const COLLECTION = 'citations';
const STATS_DOC = '_stats';

// ─── ID generation ──────────────────────────────────────────────────────
/**
 * Generate deterministic Citation ID for dedup.
 * Same source paper + same target DOI = same ID = update-in-place semantic.
 */
export function generateCitationId(
  sourcePaperId: string,
  targetDoi?: string,
  targetTitle?: string
): string {
  if (targetDoi) {
    const hash = crypto
      .createHash('sha256')
      .update(targetDoi.toLowerCase())
      .digest('hex')
      .slice(0, 8);
    return `${sourcePaperId}:d:${hash}`;
  }
  if (targetTitle) {
    const normalized = targetTitle.toLowerCase().replace(/\s+/g, ' ').trim();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
    return `${sourcePaperId}:t:${hash}`;
  }
  throw new Error('Citation requires targetDoi or targetTitle for ID generation');
}

// ─── createCitation (idempotent via deterministic ID) ───────────────────
/**
 * Create or update-in-place a citation edge.
 * If document already exists at deterministic ID, the new metadata overrides
 * unless existing has higher confidence ('manual' > 'doi-exact' > 'title-fuzzy').
 */
export async function createCitation(input: CitationCreateInput): Promise<Citation> {
  const id = generateCitationId(input.sourcePaperId, input.targetDoi, input.targetTitle);
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(input.tenantId).collection(COLLECTION).doc(id);

  const now = Date.now();
  const citation: Citation = {
    id,
    schemaVersion: 1,
    tenantId: input.tenantId,
    createdAt: now,
    createdBy: input.createdBy,
    lifecycleStatus: 'active',
    sourcePaperId: input.sourcePaperId,
    targetDoi: input.targetDoi,
    targetTitle: input.targetTitle,
    targetAuthors: input.targetAuthors,
    targetYear: input.targetYear,
    targetJournal: input.targetJournal,
    targetPaperId: input.targetPaperId ?? null,
    metadataSource: input.metadataSource,
    confidence: input.confidence,
    context: input.context,
    citationType: input.citationType,
    // PROV-O: citation IS-A activity that links sourcePaper → targetPaper
    derivedFrom: [input.sourcePaperId],
    generatedBy: 'citation-extraction'
  };

  // Idempotent: if exists with HIGHER confidence, do not overwrite.
  const existing = await ref.get();
  if (existing.exists) {
    const old = existing.data() as Citation;
    const order: Record<Citation['confidence'], number> = {
      'title-fuzzy': 1,
      'doi-exact': 2,
      manual: 3
    };
    if (order[old.confidence] >= order[citation.confidence]) {
      // Existing is more trusted — preserve it, return as-is
      return old;
    }
  }

  await ref.set(citation);
  return citation;
}

// ─── getCitation ────────────────────────────────────────────────────────
export async function getCitation(tenantId: string, id: string): Promise<Citation | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Citation;
}

// ─── List by source (OUT-edges) ─────────────────────────────────────────
export interface ListCitationsOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  limit?: number;
}

export async function listCitationsBySource(
  tenantId: string,
  sourcePaperId: string,
  opts: ListCitationsOptions = {}
): Promise<Citation[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('sourcePaperId', '==', sourcePaperId);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Citation);
}

// ─── List by target (IN-edges) ──────────────────────────────────────────
/**
 * Find papers in our DB that cite the given target (by DOI or internal paperId).
 * Used to populate "Cited by" section on Paper detail page.
 */
export async function listCitationsByTarget(
  tenantId: string,
  target: { doi?: string; paperId?: string },
  opts: ListCitationsOptions = {}
): Promise<Citation[]> {
  if (!target.doi && !target.paperId) {
    throw new Error('listCitationsByTarget: provide doi or paperId');
  }
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  if (target.paperId) {
    q = q.where('targetPaperId', '==', target.paperId);
  } else if (target.doi) {
    q = q.where('targetDoi', '==', target.doi);
  }

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Citation);
}

// ─── Resolve internal target (DOI → internal paperId) ───────────────────
/**
 * Update Citation.targetPaperId when target paper is found in our DB.
 * Called by cross-reference background job after new papers added.
 */
export async function resolveInternalTarget(
  tenantId: string,
  citationId: string,
  targetPaperId: string
): Promise<void> {
  const db = getAdminFirestoreService();
  await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(citationId).update({
    targetPaperId,
    updatedAt: Date.now()
  });
}

// ─── Patch citation (limited fields) ────────────────────────────────────
export async function patchCitation(
  tenantId: string,
  id: string,
  patch: CitationPatch
): Promise<void> {
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update({ ...patch, updatedAt: Date.now() });
}

// ─── Lifecycle (deprecate / retract / reactivate) ──────────────────────
export async function deprecateCitation(tenantId: string, id: string, by: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(buildDeprecatePatch(by, {}));
}

export async function retractCitation(
  tenantId: string,
  id: string,
  by: string,
  reason: string
): Promise<void> {
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(buildRetractPatch(by, { reason }));
}

export async function reactivateCitation(tenantId: string, id: string, by: string): Promise<void> {
  const db = getAdminFirestoreService();
  const ref = db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('citation_not_found');
  const cur = snap.data() as Citation;
  if (cur.lifecycleStatus === 'retracted') {
    throw new Error('cannot_reactivate_retracted');
  }
  await ref.update(buildReactivatePatch(by));
}

// ─── Citation stats (denormalized per paper) ────────────────────────────
/**
 * Recompute citation stats for a paper. Run after Citation changes affecting
 * that paper (either as source or target).
 *
 * Stats stored at tenants/{tid}/papers/{paperId}/_stats document for
 * fast UI lookup without aggregating citations subcollection on every read.
 */
export async function recomputeCitationStats(
  tenantId: string,
  paperId: string
): Promise<PaperCitationStats> {
  const db = getAdminFirestoreService();

  // Count OUT-edges (this paper cites others)
  const outSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('sourcePaperId', '==', paperId)
    .where('lifecycleStatus', '==', 'active')
    .count()
    .get();

  // Count IN-edges (other papers cite this one)
  const inSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('targetPaperId', '==', paperId)
    .where('lifecycleStatus', '==', 'active')
    .count()
    .get();

  const stats: PaperCitationStats = {
    schemaVersion: 1,
    paperId,
    citationsOutCount: outSnap.data().count,
    citationsInCount: inSnap.data().count,
    updatedAt: Date.now()
  };

  await db
    .collection('tenants')
    .doc(tenantId)
    .collection('papers')
    .doc(paperId)
    .collection(STATS_DOC)
    .doc('citations')
    .set(stats);

  return stats;
}

/**
 * Get cached stats for a paper. Returns null if not yet computed.
 */
export async function getCitationStats(
  tenantId: string,
  paperId: string
): Promise<PaperCitationStats | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection('papers')
    .doc(paperId)
    .collection(STATS_DOC)
    .doc('citations')
    .get();
  if (!doc.exists) return null;
  return doc.data() as PaperCitationStats;
}
