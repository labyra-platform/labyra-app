/**
 * Analysis service: CRUD + lineage queries.
 *
 * Path: tenants/{tenantId}/analyses/{analysisId}
 *
 * Activity (high-volume) — uses UUID IDs, no versioning.
 *
 * @phase R164-phase-3c
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateActivityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, buildRetractPatch, buildReactivatePatch } from '@/lib/prov/lifecycle';
import type { Analysis } from '@/types/analyses';
import type { LifecycleStatus } from '@/types/prov-base';
import type { CreateAnalysisInput, UpdateAnalysisInput } from '@/lib/schemas/analysis-schema';

const COLLECTION = 'analyses';

interface CreateAnalysisContext {
  tenantId: string;
  createdBy: string;
  preallocatedId?: string;
}

export async function createAnalysis(
  input: CreateAnalysisInput,
  ctx: CreateAnalysisContext
): Promise<Analysis> {
  const db = getAdminFirestoreService();
  const id = ctx.preallocatedId ?? generateActivityId();
  const now = Date.now();

  const analysis: Analysis = {
    // ProvBase
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 1,
    createdBy: ctx.createdBy,
    createdAt: now,
    // Lineage: analysis derives from measurement + cited references
    derivedFrom: input.derivedFrom ?? [input.measurementId, ...(input.citationReferenceIds ?? [])],
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active',
    // Core
    measurementId: input.measurementId,
    sampleId: input.sampleId,
    analyzerVersion: input.analyzerVersion,
    modelTier: input.modelTier,
    modelName: input.modelName,
    analysisDuration_ms: input.analysisDuration_ms,
    costUsd: input.costUsd,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- worker payload validated at API boundary
    parsed: input.parsed as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- worker payload
    aiResult: input.aiResult as any,
    citationReferenceIds: input.citationReferenceIds,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    citationCandidates: input.citationCandidates as any,
    supersedes: input.supersedes
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(analysis);

  return analysis;
}

export async function getAnalysis(tenantId: string, id: string): Promise<Analysis | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Analysis;
}

export interface ListAnalysesOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  measurementId?: string;
  sampleId?: string;
  limit?: number;
}

export async function listAnalyses(
  tenantId: string,
  opts: ListAnalysesOptions = {}
): Promise<Analysis[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.measurementId) q = q.where('measurementId', '==', opts.measurementId);
  if (opts.sampleId) q = q.where('sampleId', '==', opts.sampleId);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Analysis);
}

interface UpdateAnalysisContext {
  tenantId: string;
  updatedBy: string;
}

export async function updateAnalysis(
  id: string,
  patch: UpdateAnalysisInput,
  ctx: UpdateAnalysisContext
): Promise<Analysis | null> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(ctx.tenantId)
    .collection(COLLECTION)
    .doc(id);

  const before = await ref.get();
  if (!before.exists) return null;

  await ref.update({
    ...patch,
    updatedAt: Date.now(),
    updatedBy: ctx.updatedBy
  });

  const after = await ref.get();
  return after.data() as Analysis;
}

export async function deprecateAnalysis(
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

export async function retractAnalysis(
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

export async function reactivateAnalysis(
  id: string,
  tenantId: string,
  userId: string
): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const status = doc.data()?.lifecycleStatus as LifecycleStatus;
  if (status === 'retracted') {
    throw new Error('Cannot reactivate retracted analysis');
  }
  await ref.update(buildReactivatePatch(userId));
}

// ─── Lineage queries ─────────────────────────────────────────────────

export async function listAnalysesByMeasurement(
  tenantId: string,
  measurementId: string
): Promise<Analysis[]> {
  return listAnalyses(tenantId, { measurementId });
}

/**
 * Find analyses that cite a given reference.
 */
export async function findAnalysesByCitedReference(
  tenantId: string,
  referenceId: string
): Promise<Analysis[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('citationReferenceIds', 'array-contains', referenceId)
    .where('lifecycleStatus', '==', 'active')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as Analysis);
}
