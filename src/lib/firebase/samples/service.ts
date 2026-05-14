/**
 * Sample service: server-side CRUD + lineage queries.
 *
 * Path: tenants/{tenantId}/samples/{sampleId}
 *
 * @phase R164-phase-3a
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, buildRetractPatch, buildReactivatePatch } from '@/lib/prov/lifecycle';
import type { Sample } from '@/types/samples';
import type { LifecycleStatus } from '@/types/prov-base';
import type { CreateSampleInput, UpdateSampleInput } from '@/lib/schemas/sample-schema';

const COLLECTION = 'samples';

interface CreateSampleContext {
  tenantId: string;
  createdBy: string;
}

export async function createSample(
  input: CreateSampleInput,
  ctx: CreateSampleContext
): Promise<Sample> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(db, ctx.tenantId, 'samples', input.sampleCode || input.name);
  const now = Date.now();

  const sample: Sample = {
    // ProvBase
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 2,
    createdBy: ctx.createdBy,
    createdAt: now,
    // Cross-entity lineage (canonical = parentMaterialIds; derivedFrom is generic
    // PROV-O alias filled with material IDs for unified lineage queries)
    derivedFrom: input.derivedFrom ?? input.parentMaterialIds,
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active',
    // Core
    sampleCode: input.sampleCode,
    name: input.name,
    description: input.description,
    parentMaterialIds: input.parentMaterialIds,
    derivedFromSampleId: input.derivedFromSampleId,
    preparedAt: input.preparedAt,
    preparedBy: input.preparedBy,
    protocol: input.protocol,
    mass: input.mass,
    volume: input.volume,
    concentration: input.concentration,
    concentrationUnit: input.concentrationUnit,
    workflowStatus: input.workflowStatus,
    location: input.location
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(sample);

  return sample;
}

export async function getSample(tenantId: string, id: string): Promise<Sample | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Sample;
}

export interface ListSamplesOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  workflowStatus?: string;
  limit?: number;
}

export async function listSamples(
  tenantId: string,
  opts: ListSamplesOptions = {}
): Promise<Sample[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.workflowStatus) q = q.where('workflowStatus', '==', opts.workflowStatus);
  q = q.orderBy('preparedAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Sample);
}

interface UpdateSampleContext {
  tenantId: string;
  updatedBy: string;
}

export async function updateSample(
  id: string,
  patch: UpdateSampleInput,
  ctx: UpdateSampleContext
): Promise<Sample | null> {
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
  return after.data() as Sample;
}

export async function deprecateSample(
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

export async function retractSample(
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

export async function reactivateSample(
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
    throw new Error('Cannot reactivate retracted sample (immutable per compliance)');
  }
  await ref.update(buildReactivatePatch(userId));
}

// ─── Lineage queries ─────────────────────────────────────────────────

/**
 * Find samples derived from a given material (forward lineage).
 */
export async function findSamplesByParentMaterial(
  tenantId: string,
  materialId: string
): Promise<Sample[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('parentMaterialIds', 'array-contains', materialId)
    .where('lifecycleStatus', '==', 'active')
    .get();
  return snap.docs.map((d) => d.data() as Sample);
}

/**
 * Find child samples derived from a parent sample.
 */
export async function findSamplesByDerivedFromSample(
  tenantId: string,
  parentSampleId: string
): Promise<Sample[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('derivedFromSampleId', '==', parentSampleId)
    .where('lifecycleStatus', '==', 'active')
    .get();
  return snap.docs.map((d) => d.data() as Sample);
}
