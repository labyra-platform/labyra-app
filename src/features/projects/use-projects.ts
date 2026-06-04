'use client';

/**
 * Read the tenant's projects, newest first, hiding non-active lifecycle records
 * (deprecated/retracted). Workflow status (incl. archived) is kept so the Admin
 * list can show + unarchive them. Thin wrapper over useTenantCollection.
 *
 * @phase R263 — Project entity (MVP data layer)
 */
import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';
import type { Project } from '@/types/project';

export function useProjects(): { projects: Project[]; isLoading: boolean } {
  const q = useTenantCollection<Project>({
    collection: 'projects',
    constraints: [orderBy('updatedAt', 'desc')]
  });

  const projects = useMemo<Project[]>(
    () => (q.data ?? []).map((d) => d.data).filter((p) => p.lifecycleStatus === 'active'),
    [q.data]
  );

  return { projects, isLoading: q.isLoading };
}
