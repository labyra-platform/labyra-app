'use client';

/**
 * Client-side Firestore CRUD for projects (per-tenant, like collections).
 * Security is enforced by rules (belongsToTenant read, isWriter write); these
 * helpers assume a signed-in user and throw otherwise.
 *
 * @phase R263 — Project entity (MVP data layer)
 * @see labyra-project-entity-spec.md
 */
import { collection as fsCollection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type { Project, ProjectInput } from '@/types/project';

const COLLECTION = 'projects';
const SCHEMA_VERSION = 1;

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

function colPath(tenantId: string): string {
  return `tenants/${tenantId}/${COLLECTION}`;
}

/** Drop undefined keys so Firestore (which rejects them) is happy. */
function pruneUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/** Create a project owned by the current user (or their group). Returns the id. */
export async function createProject(tenantId: string, input: ProjectInput): Promise<string> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const ref = doc(fsCollection(db, colPath(tenantId)));
  const now = Date.now();
  const payload: Project = {
    id: ref.id,
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    name: input.name,
    type: input.type,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    memberIds: input.memberIds,
    status: input.status,
    ...pruneUndefined({
      description: input.description,
      advisorId: input.advisorId,
      grantLevel: input.grantLevel,
      grantCode: input.grantCode,
      startDate: input.startDate,
      dueDate: input.dueDate
    })
  };
  await setDoc(ref, payload);
  return ref.id;
}

/** Update editable fields of a project. */
export async function updateProject(
  tenantId: string,
  projectId: string,
  patch: Partial<ProjectInput>
): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  const ref = doc(db, colPath(tenantId), projectId);
  await updateDoc(ref, { ...pruneUndefined(patch), updatedBy: editor, updatedAt: Date.now() });
}

/** Soft-archive: set workflow status to archived, keeping the record + history. */
export async function archiveProject(tenantId: string, projectId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  const ref = doc(db, colPath(tenantId), projectId);
  await updateDoc(ref, { status: 'archived', updatedBy: editor, updatedAt: Date.now() });
}
