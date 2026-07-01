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

  // Firestore rejects nested arrays (cellParameters / cellAng are 3×3 / flat-9
  // matrices); store the structure as a JSON string, mirroring the workflow path
  // (see worker src/dft/io.py). parseStored() decodes it back on read.
  await db
    .collection('tenants')
    .doc(ctx.tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set({ ...cs, structure: JSON.stringify(input.structure) });
  return cs;
}

/** Decode a stored crystalStructure doc — structure is a JSON string (new) or an
 *  object (legacy docs written before the string encoding). */
function parseStored(raw: Record<string, unknown>): CrystalStructure {
  const structure =
    typeof raw.structure === 'string'
      ? (JSON.parse(raw.structure) as CrystalStructure['structure'])
      : (raw.structure as CrystalStructure['structure']);
  return { ...(raw as unknown as CrystalStructure), structure };
}

export async function listCrystalStructures(tenantId: string): Promise<CrystalStructure[]> {
  const db = getAdminFirestoreService();
  const qs = await db.collection('tenants').doc(tenantId).collection(COLLECTION).get();
  return qs.docs.map((d) => parseStored(d.data())).filter((c) => c.lifecycleStatus !== 'retracted');
}

export async function getCrystalStructure(
  tenantId: string,
  id: string
): Promise<CrystalStructure | null> {
  const db = getAdminFirestoreService();
  const snap = await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const cs = parseStored(snap.data() as Record<string, unknown>);
  return cs.lifecycleStatus === 'retracted' ? null : cs;
}

export async function deleteCrystalStructure(tenantId: string, id: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id).delete();
}
