'use client';

/**
 * Generic TanStack Query hook for reading a tenant-scoped Firestore collection.
 *
 * All queries are scoped to /tenants/{tenantId}/<collection>. The hook is a
 * thin wrapper around getDocs + useQuery, with tenantId baked into the key
 * so cache invalidates correctly when tenant changes.
 */

import { useQuery } from '@tanstack/react-query';
import {
  type DocumentData,
  collection as fsCollection,
  query as fsQuery,
  getDocs,
  type QueryConstraint
} from 'firebase/firestore';
import { useTenantId } from '@/lib/auth';
import { getFirebaseFirestore } from '@/lib/firebase/client';

export interface TenantDoc<T = DocumentData> {
  id: string;
  data: T;
}

interface UseTenantCollectionOptions {
  /** Sub-collection name under /tenants/{tenantId}/ */
  collection: string;
  /** Optional where/orderBy/limit constraints */
  constraints?: QueryConstraint[];
  /** Extra cache key entries (e.g. filter values) so TanStack re-queries on change */
  cacheKey?: ReadonlyArray<string | number | boolean | null | undefined>;
  /** Stale time in ms; default 30s */
  staleTime?: number;
}

export function useTenantCollection<T = DocumentData>(opts: UseTenantCollectionOptions) {
  const tenantId = useTenantId();
  const cacheKey = opts.cacheKey ?? [];

  return useQuery<TenantDoc<T>[]>({
    queryKey: ['tenant-collection', tenantId, opts.collection, ...cacheKey],
    enabled: tenantId !== null,
    staleTime: opts.staleTime ?? 30_000,
    queryFn: async () => {
      if (!tenantId) return [];
      const db = getFirebaseFirestore();
      const colRef = fsCollection(db, `tenants/${tenantId}/${opts.collection}`);
      const q = opts.constraints ? fsQuery(colRef, ...opts.constraints) : colRef;
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as T }));
    }
  });
}
