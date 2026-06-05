'use client';

/**
 * Read the tenant's protocol templates, newest first, hiding non-active
 * lifecycle records. Workflow status (incl. archived) is kept so the library can
 * show + unarchive them. Thin wrapper over useTenantCollection.
 *
 * @phase R270 — Protocol Template (MVP data layer)
 */
import { orderBy } from 'firebase/firestore';
import { useMemo } from 'react';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';
import type { ProtocolTemplate } from '@/types/protocol-template';

export function useProtocolTemplates(): {
  templates: ProtocolTemplate[];
  isLoading: boolean;
} {
  const q = useTenantCollection<ProtocolTemplate>({
    collection: 'protocolTemplates',
    constraints: [orderBy('updatedAt', 'desc')]
  });

  const templates = useMemo<ProtocolTemplate[]>(
    () => (q.data ?? []).map((d) => d.data).filter((t) => t.lifecycleStatus === 'active'),
    [q.data]
  );

  return { templates, isLoading: q.isLoading };
}
