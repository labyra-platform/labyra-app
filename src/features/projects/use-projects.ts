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

export function useProjects(): {
  projects: Project[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useTenantCollection<Project>({
    collection: 'projects',
    constraints: [orderBy('updatedAt', 'desc')]
  });

  const projects = useMemo<Project[]>(
    () => (q.data ?? []).map((d) => d.data).filter((p) => p.lifecycleStatus === 'active'),
    [q.data]
  );

  // R574: forward the query's error and retry so the detail page can tell a
  // failed load from a missing project — today a failure falls through to the
  // not-found block, which tells the user the project was deleted when the
  // query merely broke.
  //
  // Note this only ever fires for a genuine outage. useTenantCollection turns
  // 'permission-denied' into an empty list on purpose (R509: rules gate reads
  // by feature, so no-access is an answer, not an error), and an empty list
  // lands on not-found — which is the right place for "no project you can
  // read". So isError here means the network or Firestore actually failed,
  // which is exactly the case the page was mishandling.
  return {
    projects,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => {
      void q.refetch();
    }
  };
}
