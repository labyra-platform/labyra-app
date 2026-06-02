'use client';

/**
 * Read the current user's manuscripts (per-user, createdBy == uid), newest
 * first, excluding retracted. Thin wrapper over useTenantCollection; the
 * createdBy + updatedAt query uses the composite index added in R284.
 *
 * @phase R-aiscience-4
 */
import { orderBy, where } from 'firebase/firestore';
import { useMemo } from 'react';
import type { Manuscript } from '@/features/manuscript/types';
import { useAuth } from '@/lib/auth/use-auth';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';

export function useManuscripts(): { manuscripts: Manuscript[]; isLoading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const q = useTenantCollection<Manuscript>({
    collection: 'manuscripts',
    constraints: uid
      ? [where('createdBy', '==', uid), orderBy('updatedAt', 'desc')]
      : [where('createdBy', '==', '__none__')],
    cacheKey: [uid ?? 'anon']
  });

  const manuscripts = useMemo<Manuscript[]>(
    () => (q.data ?? []).map((d) => d.data).filter((m) => m.lifecycleStatus !== 'retracted'),
    [q.data]
  );

  return { manuscripts, isLoading: q.isLoading };
}
