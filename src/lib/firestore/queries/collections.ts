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
  getDoc,
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
const UNFILED_BUCKET_NAME = 'Chưa phân loại';

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
 * Delete a collection. Owned children are re-parented UP ONE LEVEL (to the
 * deleted node's own parent; root for a top-level delete). When a SUBcollection
 * with papers is deleted, those papers move into the parent's auto-managed
 * "Chưa phân loại" (unfiled) bucket subcollection (found-or-created) so nothing
 * is orphaned. Deleting a top-level collection (or the bucket itself) leaves its
 * papers globally unfiled. Papers are never deleted (grouping only).
 *
 * NOTE: every internal query is constrained by `createdBy == owner` — Firestore
 * rules reject a query that is not provably owner-scoped, which previously made
 * delete silently fail.
 */
export async function deleteCollection(tenantId: string, collectionId: string): Promise<void> {
  const db = getFirebaseFirestore();
  const owner = requireUid();

  const targetSnap = await getDoc(doc(db, `${colPath(tenantId)}/${collectionId}`));
  if (!targetSnap.exists()) return;
  const target = targetSnap.data() as PaperCollection;
  const parentId = target.parentId ?? null;

  const childrenSnap = await getDocs(
    query(
      fsCollection(db, colPath(tenantId)),
      where('createdBy', '==', owner),
      where('parentId', '==', collectionId)
    )
  );

  // A subcollection's papers go to the parent's unfiled bucket. Buckets and
  // top-level collections do not spawn a bucket (papers just become unfiled).
  const needsBucket = parentId !== null && target.paperIds.length > 0 && !target.isUnfiledBucket;
  let bucketId: string | null = null;
  if (needsBucket) {
    const siblingsSnap = await getDocs(
      query(
        fsCollection(db, colPath(tenantId)),
        where('createdBy', '==', owner),
        where('parentId', '==', parentId)
      )
    );
    bucketId =
      siblingsSnap.docs
        .map((d) => d.data() as PaperCollection)
        .find((c) => c.isUnfiledBucket && c.id !== collectionId)?.id ?? null;
  }

  const batch = writeBatch(db);
  const now = Date.now();

  for (const child of childrenSnap.docs) {
    batch.update(child.ref, { parentId, updatedAt: now });
  }

  if (needsBucket) {
    if (bucketId) {
      batch.update(doc(db, `${colPath(tenantId)}/${bucketId}`), {
        paperIds: arrayUnion(...target.paperIds),
        updatedAt: now
      });
    } else {
      const bucketRef = doc(fsCollection(db, colPath(tenantId)));
      const bucket: PaperCollection = {
        id: bucketRef.id,
        tenantId,
        schemaVersion: SCHEMA_VERSION,
        createdBy: owner,
        createdAt: now,
        updatedBy: owner,
        updatedAt: now,
        lifecycleStatus: 'active',
        name: UNFILED_BUCKET_NAME,
        paperIds: [...target.paperIds],
        parentId,
        isUnfiledBucket: true
      };
      batch.set(bucketRef, bucket);
    }
  }

  batch.delete(doc(db, `${colPath(tenantId)}/${collectionId}`));
  await batch.commit();
}
