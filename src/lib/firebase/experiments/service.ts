/**
 * Experiment service: server-side CRUD + lineage queries.
 *
 * Path: tenants/{tenantId}/experiments/{experimentId}
 *
 * @phase R164-phase-3b
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, reactivateDocTx, retractDocTx } from '@/lib/prov/lifecycle';
import type { CreateExperimentInput, UpdateExperimentInput } from '@/lib/schemas/experiment-schema';
import type { Experiment } from '@/types/experiments';
import type { LifecycleStatus } from '@/types/prov-base';

const COLLECTION = 'experiments';

interface CreateExperimentContext {
  tenantId: string;
  createdBy: string;
}

export async function createExperiment(
  input: CreateExperimentInput,
  ctx: CreateExperimentContext
): Promise<Experiment> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(
    db,
    ctx.tenantId,
    'experiments',
    input.experimentCode || input.title
  );
  const now = Date.now();

  const exp: Experiment = {
    // ProvBase
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 2,
    createdBy: ctx.createdBy,
    createdAt: now,
    // PROV-O derivedFrom: experiments derive from samples used
    derivedFrom: input.derivedFrom,
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active',
    // Core
    experimentCode: input.experimentCode,
    title: input.title,
    description: input.description,
    hypothesis: input.hypothesis,
    experimentType: input.experimentType,
    workflowStatus: input.workflowStatus,
    equipmentUsed: input.equipmentUsed,
    scheduledAt: input.scheduledAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    notes: input.notes,
    attachmentPaths: input.attachmentPaths,
    temperature: input.temperature,
    pressure: input.pressure,
    duration: input.duration,
    results: input.results
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(exp);

  return exp;
}

export async function getExperiment(tenantId: string, id: string): Promise<Experiment | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Experiment;
}

export interface ListExperimentsOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  workflowStatus?: string;
  experimentType?: string;
  limit?: number;
}

export async function listExperiments(
  tenantId: string,
  opts: ListExperimentsOptions = {}
): Promise<Experiment[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.workflowStatus) q = q.where('workflowStatus', '==', opts.workflowStatus);
  if (opts.experimentType) q = q.where('experimentType', '==', opts.experimentType);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Experiment);
}

interface UpdateExperimentContext {
  tenantId: string;
  updatedBy: string;
}

export async function updateExperiment(
  id: string,
  patch: UpdateExperimentInput,
  ctx: UpdateExperimentContext
): Promise<Experiment | null> {
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
  return after.data() as Experiment;
}

export async function deprecateExperiment(
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

export async function retractExperiment(
  id: string,
  tenantId: string,
  userId: string,
  reason: string
): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  await retractDocTx(ref, userId, reason);
}

export async function reactivateExperiment(
  id: string,
  tenantId: string,
  userId: string
): Promise<void> {
  const ref = getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id);
  await reactivateDocTx(ref, userId);
}

// ─── Lineage queries ─────────────────────────────────────────────────

// R186-2b: findExperimentsByContainsSample removed. Link inverted — a sample now
// references exactly one experiment via sample.experimentId. To find samples of
// an experiment, query the samples collection: where('experimentId','==',expId).
