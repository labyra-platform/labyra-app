'use client';

/**
 * Protocol template detail. Read mode renders a WorkflowGraph of the steps;
 * "Edit graph" swaps in the interactive ProtocolEditor (R270c). Resolves the
 * template client-side from useProtocolTemplates. Step inputs preview as the
 * node subtitle in read mode.
 *
 * @phase R270c — Protocol editor (read/edit toggle)
 */
import { IconPencil } from '@tabler/icons-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import PageContainer from '@/components/layout/page-container';
import { ProtocolEditor } from '@/features/protocol/protocol-editor';
import { useProtocolTemplates } from '@/features/protocol/use-protocol-templates';
import { layoutLayered } from '@/features/workflow/layout';
import type { WfEdge, WfNode } from '@/features/workflow/types';
import { WorkflowGraph } from '@/features/workflow/workflow-graph';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';

export default function ProtocolTemplateDetailPage() {
  const t = useTranslations('protocolTemplates');
  const params = useParams();
  const id = String(params.id ?? '');
  const { templates, isLoading } = useProtocolTemplates();
  const template = templates.find((tpl) => tpl.id === id);
  const [editing, setEditing] = useState(false);

  const edges = useMemo<WfEdge[]>(
    () =>
      template ? template.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) : [],
    [template]
  );

  const nodes = useMemo<WfNode[]>(() => {
    if (!template) return [];
    const wf: WfNode[] = template.steps.map((s) => ({
      id: s.id,
      position: { x: 0, y: 0 },
      data: {
        label: s.label,
        kind: s.kind,
        subtitle:
          s.subtitle ??
          (s.inputs && s.inputs.length > 0 ? s.inputs.map((i) => i.label).join(' · ') : undefined)
      }
    }));
    return layoutLayered(wf, edges);
  }, [template, edges]);

  return (
    <PageContainer
      pageTitle={template?.name ?? t('title')}
      pageDescription={template?.description ?? ''}
      pageHeaderAction={
        template && !editing ? (
          <Button size='sm' onClick={() => setEditing(true)}>
            <IconPencil className='size-4' />
            {t('editGraph')}
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : !template ? (
        <div className='flex flex-col items-center justify-center py-16 text-center'>
          <p className='text-sm font-medium'>{t('notFound')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('notFoundHint')}</p>
        </div>
      ) : editing ? (
        <ProtocolEditor template={template} onClose={() => setEditing(false)} />
      ) : template.steps.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center'>
          <p className='text-sm font-medium'>{t('emptyGraph')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('emptyGraphHint')}</p>
        </div>
      ) : (
        <WorkflowGraph nodes={nodes} edges={edges} />
      )}
    </PageContainer>
  );
}
