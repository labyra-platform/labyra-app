'use client';

/**
 * Client-side Firestore CRUD for per-user paper collections (Zotero-style).
 * Security is enforced by rules (createdBy == auth.uid); these helpers assume a
 * signed-in user and throw otherwise. Pure tree validation (cycle/depth) lives
 * in collection-tree.ts and is reused by moveCollection.
 *
 * @phase R-collection-2
 * @see labyra-collection-download-strategy.md §3.I.2
 */
import {
  arrayRemove,
  arrayUnion,
  collection as fsCollection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { validateMove } from '@/features/papers/collections/collection-tree';
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase/client';
import type { PaperCollection } from '@/types/collections';

const COLLECTION = 'collections';
const SCHEMA_VERSION = 1;

function requireUid(): string {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

function colPath(tenantId: string): string {
  return `tenants/${tenantId}/${COLLECTION}`;
}

export interface CreateCollectionInput {
  name: string;
  parentId?: string | null;
  color?: string;
  description?: string;
}

/** Create a collection owned by the current user. Returns the new id. */
export async function createCollection(
  tenantId: string,
  input: CreateCollectionInput
): Promise<string> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const ref = doc(fsCollection(db, colPath(tenantId)));
  const now = Date.now();
  const payload: PaperCollection = {
    id: ref.id,
    tenantId,
    schemaVersion: SCHEMA_VERSION,
    createdBy: owner,
    createdAt: now,
    updatedBy: owner,
    updatedAt: now,
    lifecycleStatus: 'active',
    name: input.name,
    paperIds: [],
    parentId: input.parentId ?? null,
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.description !== undefined ? { description: input.description } : {})
  };
  await setDoc(ref, payload);
  return ref.id;
}

/** Update name/description/color. */
export async function updateCollectionMeta(
  tenantId: string,
  collectionId: string,
  patch: { name?: string; description?: string; color?: string }
): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  await updateDoc(doc(db, `${colPath(tenantId)}/${collectionId}`), {
    ...patch,
    updatedAt: Date.now(),
    updatedBy: owner
  });
}

export async function addPapersToCollection(
  tenantId: string,
  collectionId: string,
  paperIds: string[]
): Promise<void> {
  if (paperIds.length === 0) return;
  const db = getFirebaseFirestore();
  const owner = requireUid();
  await updateDoc(doc(db, `${colPath(tenantId)}/${collectionId}`), {
    paperIds: arrayUnion(...paperIds),
    updatedAt: Date.now(),
    updatedBy: owner
  });
}

export async function removePapersFromCollection(
  tenantId: string,
  collectionId: string,
  paperIds: string[]
): Promise<void> {
  if (paperIds.length === 0) return;
  const db = getFirebaseFirestore();
  const owner = requireUid();
  await updateDoc(doc(db, `${colPath(tenantId)}/${collectionId}`), {
    paperIds: arrayRemove(...paperIds),
    updatedAt: Date.now(),
    updatedBy: owner
  });
}

/**
 * Move a collection under a new parent (null = root). Validates against cycles
 * and the depth cap using the full owned set before writing.
 */
export async function moveCollection(
  tenantId: string,
  collectionId: string,
  newParentId: string | null
): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();
  const snap = await getDocs(
    query(fsCollection(db, colPath(tenantId)), where('createdBy', '==', owner))
  );
  const all = snap.docs.map((d) => d.data() as PaperCollection);
  validateMove(all, collectionId, newParentId); // throws on cycle / depth
  await updateDoc(doc(db, `${colPath(tenantId)}/${collectionId}`), {
    parentId: newParentId,
    updatedAt: Date.now(),
    updatedBy: owner
  });
}

/**
 * Delete a collection. Direct children are promoted to root (parentId = null)
 * so nothing is orphaned and no papers are touched (grouping only).
 */
export async function deleteCollection(tenantId: string, collectionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  requireUid();
  const children = await getDocs(
    query(fsCollection(db, colPath(tenantId)), where('parentId', '==', collectionId))
  );
  const batch = writeBatch(db);
  const now = Date.now();
  for (const child of children.docs) {
    batch.update(child.ref, { parentId: null, updatedAt: now });
  }
  batch.delete(doc(db, `${colPath(tenantId)}/${collectionId}`));
  await batch.commit();
}
