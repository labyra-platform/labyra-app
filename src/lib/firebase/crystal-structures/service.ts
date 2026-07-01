/**
 * CrystalStructure service: server-side CRUD via Firebase Admin SDK.
 *
 * Path: tenants/{tenantId}/crystalStructures/{id}
 *
 * @phase R318-crystal-structures
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import type { CreateCrystalStructureInput, CrystalStructure } from '@/types/crystal-structure';

const COLLECTION = 'crystalStructures';

interface CreateContext {
  tenantId: string;
  createdBy: string;
}

export async function createCrystalStructure(
  input: CreateCrystalStructureInput,
  ctx: CreateContext
): Promise<CrystalStructure> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(db, ctx.tenantId, 'crystalStructures', input.name);
  const now = Date.now();

  const cs: CrystalStructure = {
    id,
    tenantId: ctx.tenantId,
    schemaVersion: 1,
    createdBy: ctx.createdBy,
    createdAt: now,
    updatedAt: now,
    lifecycleStatus: 'active',
    name: input.name,
    source: input.source,
    mpId: input.mpId,
    verified: input.verified,
    structure: input.structure
  };

  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(cs);
  return cs;
}

export async function listCrystalStructures(tenantId: string): Promise<CrystalStructure[]> {
  const db = getAdminFirestoreService();
  const qs = await db.collection('tenants').doc(tenantId).collection(COLLECTION).get();
  return qs.docs
    .map((d) => d.data() as CrystalStructure)
    .filter((c) => c.lifecycleStatus !== 'retracted');
}

export async function deleteCrystalStructure(tenantId: string, id: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id).delete();
}
