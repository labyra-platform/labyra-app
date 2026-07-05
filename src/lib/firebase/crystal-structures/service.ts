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
    structure: input.structure,
    scene: input.scene
  };

  // Firestore rejects nested arrays (cellParameters / cellAng in structure;
  // lattice / bond endpoints in scene) — store both as JSON strings, mirroring
  // the workflow path (worker src/dft/io.py). parseStored() decodes on read.
  // Scene is precomputed at import so the 3D viewer skips the worker round-trip.
  const stored: Record<string, unknown> = { ...cs, structure: JSON.stringify(input.structure) };
  if (input.scene) stored.scene = JSON.stringify(input.scene);
  else delete stored.scene; // never write `undefined` (Firestore rejects it)
  await db.collection('tenants').doc(ctx.tenantId).collection(COLLECTION).doc(id).set(stored);
  return cs;
}

/** Cache a computed render scene onto an existing structure (lazy backfill for
 *  legacy docs that were imported before scenes were precomputed). */
export async function attachScene(
  tenantId: string,
  id: string,
  scene: CrystalStructure['scene']
): Promise<void> {
  if (!scene) return;
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set({ scene: JSON.stringify(scene) }, { merge: true });
}

/** Cache a computed crystallographic analysis onto an existing structure. */
export async function attachAnalysis(
  tenantId: string,
  id: string,
  analysis: CrystalStructure['analysis']
): Promise<void> {
  if (!analysis) return;
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set({ analysis: JSON.stringify(analysis) }, { merge: true });
}

/** Cache a Materials Project summary onto an existing structure. */
export async function attachMpSummary(
  tenantId: string,
  id: string,
  mpSummary: CrystalStructure['mpSummary']
): Promise<void> {
  if (!mpSummary) return;
  const db = getAdminFirestoreService();
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set({ mpSummary: JSON.stringify(mpSummary) }, { merge: true });
}

/** Decode a stored crystalStructure doc — structure is a JSON string (new) or an
 *  object (legacy docs written before the string encoding). */
function parseStored(raw: Record<string, unknown>): CrystalStructure {
  const structure =
    typeof raw.structure === 'string'
      ? (JSON.parse(raw.structure) as CrystalStructure['structure'])
      : (raw.structure as CrystalStructure['structure']);
  const scene =
    typeof raw.scene === 'string'
      ? (JSON.parse(raw.scene) as CrystalStructure['scene'])
      : (raw.scene as CrystalStructure['scene']);
  const analysis =
    typeof raw.analysis === 'string'
      ? (JSON.parse(raw.analysis) as CrystalStructure['analysis'])
      : (raw.analysis as CrystalStructure['analysis']);
  const mpSummary =
    typeof raw.mpSummary === 'string'
      ? (JSON.parse(raw.mpSummary) as CrystalStructure['mpSummary'])
      : (raw.mpSummary as CrystalStructure['mpSummary']);
  return { ...(raw as unknown as CrystalStructure), structure, scene, analysis, mpSummary };
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
