/**
 * DftProject service: server-side CRUD via Firebase Admin SDK.
 *
 *   tenants/{tid}/dftProjects/{projectId}
 *   tenants/{tid}/dftProjects/{projectId}/composeStates/{composeId}
 *
 * Projects group crystal-structure references and hold saved compose states so an
 * in-progress workflow survives navigation. Compose states are keyed by a stable
 * composeId derived from (structureId, runId); runId is unique within a project.
 *
 * @phase R376-projects
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { generateEntityId } from '@/lib/prov/id-generator';
import type {
  CreateDftProjectInput,
  DftComposeState,
  DftProject,
  SaveComposeStateInput
} from '@/types/dft-project';

const COLLECTION = 'dftProjects';
const SUBCOLLECTION = 'composeStates';

function toMillis(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const ts = raw as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const s = ts._seconds ?? ts.seconds;
  return typeof s === 'number' ? s * 1000 : null;
}

/** Deterministic composeId so re-saving the same (structure, runId) overwrites. */
function composeId(structureId: string, runId: string): string {
  return `${structureId}__${runId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 200);
}

export async function createDftProject(
  input: CreateDftProjectInput,
  ctx: { tenantId: string; createdBy: string }
): Promise<DftProject> {
  const db = getAdminFirestoreService();
  const id = await generateEntityId(db, ctx.tenantId, COLLECTION, input.name);
  const now = Date.now();
  const project: DftProject = { id, name: input.name, createdAt: now, structureIds: [] };
  await db
    .collection('tenants')
    .doc(ctx.tenantId)
    .collection(COLLECTION)
    .doc(id)
    .set({ ...project, createdBy: ctx.createdBy });
  return project;
}

export async function listDftProjects(tenantId: string): Promise<DftProject[]> {
  const db = getAdminFirestoreService();
  const qs = await db.collection('tenants').doc(tenantId).collection(COLLECTION).get();
  return qs.docs
    .map((d) => {
      const data = d.data() ?? {};
      return {
        id: d.id,
        name: (data.name as string) ?? d.id,
        createdAt: toMillis(data.createdAt),
        structureIds: (data.structureIds as string[] | undefined) ?? []
      };
    })
    .toSorted((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function getDftProject(tenantId: string, id: string): Promise<DftProject | null> {
  const db = getAdminFirestoreService();
  const snap = await db.collection('tenants').doc(tenantId).collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    name: (data.name as string) ?? snap.id,
    createdAt: toMillis(data.createdAt),
    structureIds: (data.structureIds as string[] | undefined) ?? []
  };
}

/** Add/remove a structure reference (idempotent via arrayUnion/arrayRemove). */
export async function setProjectStructure(
  tenantId: string,
  projectId: string,
  structureId: string,
  attach: boolean
): Promise<void> {
  const db = getAdminFirestoreService();
  const { FieldValue } = await import('firebase-admin/firestore');
  await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(projectId)
    .update({
      structureIds: attach
        ? FieldValue.arrayUnion(structureId)
        : FieldValue.arrayRemove(structureId)
    });
}

export async function listComposeStates(
  tenantId: string,
  projectId: string
): Promise<DftComposeState[]> {
  const db = getAdminFirestoreService();
  const qs = await db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(projectId)
    .collection(SUBCOLLECTION)
    .get();
  return qs.docs.map((d) => {
    const data = d.data() ?? {};
    return {
      id: d.id,
      structureId: (data.structureId as string) ?? '',
      runId: (data.runId as string) ?? '',
      nodes: data.nodes ? JSON.parse(data.nodes as string) : [],
      global: data.global ? JSON.parse(data.global as string) : null,
      selectedId: (data.selectedId as string | undefined) ?? null,
      updatedAt: toMillis(data.updatedAt)
    };
  });
}

/** Persist (or overwrite) a compose state. Rejects a runId already used by a
 * different structure in the project (job names must stay unique). Returns the
 * saved state's updatedAt. */
export async function saveComposeState(
  tenantId: string,
  input: SaveComposeStateInput
): Promise<{ updatedAt: number }> {
  const db = getAdminFirestoreService();
  const col = db
    .collection('tenants')
    .doc(tenantId)
    .collection(COLLECTION)
    .doc(input.projectId)
    .collection(SUBCOLLECTION);

  // runId must be unique within the project (across structures).
  const clash = await col.where('runId', '==', input.runId).get();
  const conflicting = clash.docs.find((d) => (d.data()?.structureId ?? '') !== input.structureId);
  if (conflicting) {
    throw new Error(`runId '${input.runId}' is already used in this project`);
  }

  const now = Date.now();
  const id = composeId(input.structureId, input.runId);
  await col.doc(id).set({
    structureId: input.structureId,
    runId: input.runId,
    nodes: JSON.stringify(input.nodes),
    global: JSON.stringify(input.global),
    selectedId: input.selectedId ?? null,
    updatedAt: now
  });
  return { updatedAt: now };
}
