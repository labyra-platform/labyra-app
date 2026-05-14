/**
 * Material service: server-side CRUD via Firebase Admin SDK.
 *
 * Path: tenants/{tenantId}/materials/{materialId}
 *
 * @phase R164-phase-3a
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import { buildDeprecatePatch, buildRetractPatch, buildReactivatePatch } from '@/lib/prov/lifecycle';
import type { Material } from '@/types/materials';
import type { LifecycleStatus } from '@/types/prov-base';
import type { CreateMaterialInput, UpdateMaterialInput } from '@/lib/schemas/material-schema';

const COLLECTION = 'materials';

interface CreateMaterialContext {
  tenantId: string;
  createdBy: string;
}

export async function createMaterial(
  input: CreateMaterialInput,
  ctx: CreateMaterialContext
): Promise<Material> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(db, ctx.tenantId, 'materials', input.name);
  const now = Date.now();

  const material: Material = {
    // ProvBase
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 2,
    createdBy: ctx.createdBy,
    createdAt: now,
    derivedFrom: input.derivedFrom,
    generatedBy: input.generatedBy,
    lifecycleStatus: 'active',
    // Core
    name: input.name,
    formula: input.formula,
    category: input.category,
    cas: input.cas,
    quantity: input.quantity,
    unit: input.unit,
    location: input.location,
    supplier: input.supplier,
    lotNumber: input.lotNumber,
    purchaseDate: input.purchaseDate,
    expiryDate: input.expiryDate,
    hazardLevel: input.hazardLevel,
    hazardNotes: input.hazardNotes
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(material);

  return material;
}

export async function getMaterial(tenantId: string, id: string): Promise<Material | null> {
  const doc = await getAdminFirestoreService()
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Material;
}

export interface ListMaterialsOptions {
  includeDeprecated?: boolean;
  includeRetracted?: boolean;
  category?: string;
  limit?: number;
}

export async function listMaterials(
  tenantId: string,
  opts: ListMaterialsOptions = {}
): Promise<Material[]> {
  const db = getAdminFirestoreService();
  let q: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection(COLLECTION);

  // Build lifecycle filter list
  const allowedStatuses: LifecycleStatus[] = ['active'];
  if (opts.includeDeprecated) allowedStatuses.push('deprecated');
  if (opts.includeRetracted) allowedStatuses.push('retracted');
  q = q.where('lifecycleStatus', 'in', allowedStatuses);

  if (opts.category) q = q.where('category', '==', opts.category);
  q = q.orderBy('createdAt', 'desc');
  if (opts.limit) q = q.limit(opts.limit);

  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Material);
}

interface UpdateMaterialContext {
  tenantId: string;
  updatedBy: string;
}

export async function updateMaterial(
  id: string,
  patch: UpdateMaterialInput,
  ctx: UpdateMaterialContext
): Promise<Material | null> {
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
  return after.data() as Material;
}

export async function deprecateMaterial(
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

export async function retractMaterial(
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

export async function reactivateMaterial(
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
    throw new Error('Cannot reactivate retracted material (immutable per compliance)');
  }
  await ref.update(buildReactivatePatch(userId));
}
