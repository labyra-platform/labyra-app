'use client';

/**
 * Read the current user's paper collections (per-user, createdBy == uid) and
 * expose them both flat and as a nested tree. Thin wrapper over
 * useTenantCollection; the createdBy + updatedAt query uses the composite index
 * added in R277.
 *
 * @phase R-collection-3
 */
import { orderBy, where } from 'firebase/firestore';
import { useMemo } from 'react';
import {
  type CollectionNode,
  buildCollectionTree
} from '@/features/papers/collections/collection-tree';
import { useAuth } from '@/lib/auth/use-auth';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';
import type { PaperCollection } from '@/types/collections';

/** dataTransfer MIME used when dragging a paper row onto a collection (DnD). */
export const PAPER_DND_MIME = 'application/x-labyra-paper';

/** Which scope the papers view is filtered to. */
export type CollectionSelection =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'unfiled' }
  | { kind: 'collection'; collectionId: string };

/** Paper-id filter derived from a CollectionSelection, applied by PaperList. */
export type CollectionPaperFilter =
  | { kind: 'include'; ids: Set<string> }
  | { kind: 'exclude'; ids: Set<string> };

export function useCollections(): {
  collections: PaperCollection[];
  tree: CollectionNode[];
  isLoading: boolean;
} {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const q = useTenantCollection<PaperCollection>({
    collection: 'collections',
    // When not signed in, query a sentinel uid so the result is empty without a
    // rules error (rather than an unfiltered read that rules would reject).
    constraints: uid
      ? [where('createdBy', '==', uid), orderBy('updatedAt', 'desc')]
      : [where('createdBy', '==', '__none__')],
    cacheKey: [uid ?? 'anon']
  });

  const collections = useMemo<PaperCollection[]>(() => (q.data ?? []).map((d) => d.data), [q.data]);
  const tree = useMemo(() => buildCollectionTree(collections), [collections]);

  return { collections, tree, isLoading: q.isLoading };
}
