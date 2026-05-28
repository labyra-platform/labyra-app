'use client';

/**
 * Client-side Firestore persistence for PRIVATE PDF annotations (C3a).
 * Path: tenants/{tenantId}/papers/{paperId}/annotations/{annotationId}.
 *
 * Every doc carries userId + tenantId; rules enforce that a user only ever
 * reads/writes their own (see firestore.rules → annotations). Geometry is stored
 * normalized (see src/types/annotations.ts) so it survives zoom/rotate/devices.
 *
 * Reads are realtime (onSnapshot) so a highlight appears the instant it's saved
 * and stays in sync across the user's open tabs. Writes are awaited so the UI
 * can reflect failures (unlike best-effort figure configs).
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore as db } from '@/lib/firebase/client';
import type { Annotation, NewAnnotation } from '@/types/annotations';

function annotationsPath(tenantId: string, paperId: string): string {
  return `tenants/${tenantId}/papers/${paperId}/annotations`;
}

/**
 * Subscribe to the current user's annotations for a paper. Calls `onChange`
 * with the full list on every update. Returns an unsubscribe function. On error
 * (or signed-out) it reports an empty list and `onError` if provided.
 */
export function subscribeAnnotations(
  tenantId: string,
  paperId: string,
  onChange: (annotations: Annotation[]) => void,
  onError?: (err: FirestoreError) => void
): () => void {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db(), annotationsPath(tenantId, paperId)),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const out: Annotation[] = [];
      snap.forEach((d) => {
        const data = d.data();
        out.push({ ...(data as Omit<Annotation, 'id'>), id: d.id } as Annotation);
      });
      onChange(out);
    },
    (err) => {
      onChange([]);
      onError?.(err);
    }
  );
}

/**
 * Create a new annotation for the current user. Returns the new doc id.
 * Throws if signed out or the write fails (caller handles UX).
 */
export async function createAnnotation(
  tenantId: string,
  paperId: string,
  data: NewAnnotation
): Promise<string> {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) throw new Error('Not signed in');
  const now = Date.now();
  const ref = await addDoc(collection(db(), annotationsPath(tenantId, paperId)), {
    ...data,
    tenantId,
    paperId,
    userId,
    createdAt: now,
    updatedAt: now,
    // serverTimestamp gives an authoritative time for ordering if we add it
    // later; createdAt/updatedAt (epoch ms) stay for simple client sorting.
    _serverTs: serverTimestamp()
  });
  return ref.id;
}

/** Patch an existing annotation (e.g. recolor, add a note). */
export async function updateAnnotation(
  tenantId: string,
  paperId: string,
  annotationId: string,
  patch: Partial<Pick<Annotation, 'color'>> & { note?: string }
): Promise<void> {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) throw new Error('Not signed in');
  const ref = doc(db(), `${annotationsPath(tenantId, paperId)}/${annotationId}`);
  await updateDoc(ref, { ...patch, userId, updatedAt: Date.now() });
}

/** Delete an annotation. */
export async function deleteAnnotation(
  tenantId: string,
  paperId: string,
  annotationId: string
): Promise<void> {
  const ref = doc(db(), `${annotationsPath(tenantId, paperId)}/${annotationId}`);
  await deleteDoc(ref);
}
