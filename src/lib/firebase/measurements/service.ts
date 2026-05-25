// @r181-11-applied: Firestore/Storage path measurements → spectra
// R186-3: COLLECTION corrected to 'spectra' to match worker + notify-complete.
/**
 * Measurement service: server-side CRUD + lineage queries.
 *
 * Path: tenants/{tenantId}/spectra/{measurementId}
 *
 * Note: Measurement IDs are UUIDs (high-volume activity). Phase 5 will rename
 * the existing `spectra` collection to `measurements` — for now this service
 * targets the new collection name; old `spectra` paths still work via
 * existing R162/R163 routes until Phase 5 ships.
 *
 * @phase R164-phase-3b
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateActivityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, reactivateDocTx, retractDocTx } from '@/lib/prov/lifecycle';
import type {
  CreateMeasurementInput,
  UpdateMeasurementInput
} from '@/lib/schemas/measurement-schema';
import type { Measurement, MeasurementProcessingStatus } from '@/types/measurements';
import type { LifecycleStatus } from '@/types/prov-base';

const COLLECTION = 'spectra'; // R186-3: canonical (worker source of truth)

interface CreateMeasurementContext {
  tenantId: string;
  createdBy: string;
  /**
   * Pre-allocated ID from signed-upload flow. If not provided, generates new UUID.
   */
  preallocatedId?: string;
}

export async function createMeasurement(
  input: CreateMeasurementInput,
  ctx: CreateMeasurementContext
): Promise<Measurement> {
  const db = getAdminFirestoreService();
  const id = ctx.preallocatedId ?? generateActivityId();
  const now = Date.now();

  const measurement: Measurement = {
    // ProvBase
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 1,
    createdBy: ctx.createdBy,
    createdAt: now,
    derivedFrom: input.derivedFrom ?? (input.sampleId ? [input.sampleId] : undefined),
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active',
    // Core
    sampleId: input.sampleId,
    experimentId: input.experimentId,
    spectrumType: input.spectrumType,
    formula: input.formula,
    measuredAt: input.measuredAt,
    fileAssetPath: input.fileAssetPath,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    instrument: input.instrument,
    parameters: input.parameters,
    processingStatus: input.processingStatus,
    processingStatusAt: input.processingStatusAt ?? now,
    processingError: input.processingError,
    analysisId: input.analysisId
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(measurement);

  return measurement;
}

export async function getMeasurement(tenantId: string, id: string): Promise<Measurement | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Measurement;
}

export interface ListMeasurementsOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  spectrumType?: string;
  processingStatus?: MeasurementProcessingStatus;
  limit?: number;
}

export async function listMeasurements(
  tenantId: string,
  opts: ListMeasurementsOptions = {}
): Promise<Measurement[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.spectrumType) q = q.where('spectrumType', '==', opts.spectrumType);
  if (opts.processingStatus) q = q.where('processingStatus', '==', opts.processingStatus);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Measurement);
}

interface UpdateMeasurementContext {
  tenantId: string;
  updatedBy: string;
}

export async function updateMeasurement(
  id: string,
  patch: UpdateMeasurementInput,
  ctx: UpdateMeasurementContext
): Promise<Measurement | null> {
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
  return after.data() as Measurement;
}

/**
 * Update only processingStatus + processingError (called from worker).
 * Bypasses updatedBy/At since worker writes are system events.
 */
export async function updateProcessingStatus(
  tenantId: string,
  id: string,
  status: MeasurementProcessingStatus,
  error?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    processingStatus: status,
    processingStatusAt: Date.now()
  };
  if (error !== undefined) patch.processingError = error;

  await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .update(patch);
}

export async function deprecateMeasurement(
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

export async function retractMeasurement(
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

export async function reactivateMeasurement(
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

export async function listMeasurementsBySample(
  tenantId: string,
  sampleId: string
): Promise<Measurement[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('sampleId', '==', sampleId)
    .where('lifecycleStatus', '==', 'active')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as Measurement);
}

export async function listMeasurementsByExperiment(
  tenantId: string,
  experimentId: string
): Promise<Measurement[]> {
  const snap = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .where('experimentId', '==', experimentId)
    .where('lifecycleStatus', '==', 'active')
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => d.data() as Measurement);
}
