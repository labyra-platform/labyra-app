'use client';

/**
 * Client-side Firestore CRUD for protocol templates (per-tenant, like projects).
 * Security is enforced by rules (belongsToTenant read, isWriter write); these
 * helpers assume a signed-in user and throw otherwise. The graph (steps + edges)
 * is persisted via updateProtocolGraph, separate from the name/description form.
 *
 * @phase R270 — Protocol Template (MVP data layer)
 */
import { collection as fsCollection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type {
  ProtocolEdge,
  ProtocolStep,
  ProtocolTemplate,
  ProtocolTemplateInput
} from '@/types/protocol-template';

const COLLECTION = 'protocolTemplates';
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

/** Create an empty protocol template (no steps yet). Returns the id. */
export async function createProtocolTemplate(
  tenantId: string,
  input: ProtocolTemplateInput
): Promise<string> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const ref = doc(fsCollection(db, colPath(tenantId)));
  const now = Date.now();
  const payload: ProtocolTemplate = {
    id: ref.id,
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    name: input.name,
    steps: [],
    edges: [],
    status: 'active',
    ...pruneUndefined({ description: input.description })
  };
  await setDoc(ref, payload);
  return ref.id;
}

/** Update the name/description of a template. */
export async function updateProtocolTemplate(
  tenantId: string,
  id: string,
  patch: Partial<ProtocolTemplateInput>
): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  const ref = doc(db, colPath(tenantId), id);
  await updateDoc(ref, { ...pruneUndefined(patch), updatedBy: editor, updatedAt: Date.now() });
}

/** Persist the graph (steps + edges) from the editor. */
export async function updateProtocolGraph(
  tenantId: string,
  id: string,
  graph: { steps: ProtocolStep[]; edges: ProtocolEdge[] }
): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  const ref = doc(db, colPath(tenantId), id);
  await updateDoc(ref, {
    steps: graph.steps,
    edges: graph.edges,
    updatedBy: editor,
    updatedAt: Date.now()
  });
}

/** Soft-archive: set workflow status to archived, keeping the record + history. */
export async function archiveProtocolTemplate(tenantId: string, id: string): Promise<void> {
  const db = getFirebaseFirestore();
  const editor = requireUid();
  const ref = doc(db, colPath(tenantId), id);
  await updateDoc(ref, { status: 'archived', updatedBy: editor, updatedAt: Date.now() });
}
