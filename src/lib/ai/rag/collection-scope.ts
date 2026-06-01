/**
 * Resolve a paper collection to its member paperIds — server-only (Firestore
 * admin), used by searchPapers to scope retrieval. v1 returns OWN membership
 * only (nested child collections are NOT folded in); flat-scope keeps the RAG
 * filter simple and predictable. Empty array if the collection is missing.
 *
 * @phase R-collection-2
 * @see labyra-collection-download-strategy.md §3.I.5
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export async function resolveCollectionPaperIds(
  tenantId: string,
  collectionId: string
): Promise<string[]> {
  const db = getAdminFirestoreService();
  const snap = await db.doc(`tenants/${tenantId}/collections/${collectionId}`).get();
  if (!snap.exists) return [];
  const ids = snap.data()?.paperIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((x): x is string => typeof x === 'string');
}
