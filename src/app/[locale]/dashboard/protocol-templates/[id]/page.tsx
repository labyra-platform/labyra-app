'use client';

/**
 * Protocol template detail — a read-only WorkflowGraph of the steps. Resolves the
 * template client-side from useProtocolTemplates. Step inputs preview as the node
 * subtitle. The interactive editor (add / connect steps, input-on-node) is R270c.
 *
 * @phase R270b — Protocol Template UI
 */
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import PageContainer from '@/components/layout/page-container';
import { useProtocolTemplates } from '@/features/protocol/use-protocol-templates';
import { layoutLayered } from '@/features/workflow/layout';
import type { WfEdge, WfNode } from '@/features/workflow/types';
import { WorkflowGraph } from '@/features/workflow/workflow-graph';
import { ListSkeleton } from '@/components/ui/list-skeleton';

export default function ProtocolTemplateDetailPage() {
  const t = useTranslations('protocolTemplates');
  const params = useParams();
  const id = String(params.id ?? '');
  const { templates, isLoading } = useProtocolTemplates();
  const template = templates.find((tpl) => tpl.id === id);

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
    >
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : !template ? (
        <div className='flex flex-col items-center justify-center py-16 text-center'>
          <p className='text-sm font-medium'>{t('notFound')}</p>
          <p className='mt-1 text-sm text-muted-foreground'>{t('notFoundHint')}</p>
        </div>
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
