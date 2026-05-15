'use client';

/**
 * Client wrapper for Reference detail page — hosts LifecycleActions +
 * collapsible LineageGraph. Server component embeds this with id + status.
 *
 * @phase R165-phase-4-ref-ui
 */
import { LifecycleActions } from '@/components/lifecycle/lifecycle-actions';
import { LifecycleStatusBadge } from '@/components/lifecycle/lifecycle-status-badge';
import { LineageGraph } from '@/components/lineage/lineage-graph';
import type { LifecycleStatus } from '@/types/prov-base';

interface ReferenceDetailActionsProps {
  id: string;
  status: LifecycleStatus;
}

export function ReferenceDetailActions({ id, status }: ReferenceDetailActionsProps) {
  return (
    <div className='flex items-center gap-3'>
      <LifecycleStatusBadge status={status} />
      <LifecycleActions
        entity='references'
        id={id}
        status={status}
        i18nNamespace='referenceCards'
      />
    </div>
  );
}

interface ReferenceLineageSectionProps {
  id: string;
}

export function ReferenceLineageSection({ id }: ReferenceLineageSectionProps) {
  return (
    <section className='space-y-2'>
      <details>
        <summary className='cursor-pointer text-sm font-medium hover:text-foreground text-muted-foreground'>
          {`📊 Sơ đồ lineage (PROV-O)`}
        </summary>
        <div className='mt-3'>
          <LineageGraph rootType='reference' rootId={id} maxDepth={3} />
        </div>
      </details>
    </section>
  );
}
