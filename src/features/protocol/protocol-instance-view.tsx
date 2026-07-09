'use client';

/**
 * An experiment's protocol instance. When none is attached, offers to clone a
 * template; once attached, renders the run as a read-only WorkflowGraph with
 * per-step execution status (dots) and on-node inputs. Overriding values + moving
 * step status + linking measurements are later rounds (R272/R273).
 *
 * @phase R271 — Protocol Instance (attach + view)
 */
import { IconPlugConnected } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useProtocolInstance } from '@/features/protocol/use-protocol-instance';
import { ProtocolInstanceInspector } from '@/features/protocol/protocol-instance-inspector';
import { useProtocolTemplates } from '@/features/protocol/use-protocol-templates';
import { layoutLayered } from '@/features/workflow/layout';
import type { WfEdge, WfNode } from '@/features/workflow/types';
import { WorkflowGraph } from '@/features/workflow/workflow-graph';
import { useTenantId } from '@/lib/auth/use-claims';
import {
  createInstanceFromTemplate,
  updateInstanceSteps
} from '@/lib/firestore/queries/protocol-instances';
import type { ProtocolInstanceStep, ProtocolStepStatus } from '@/types/protocol-instance';

const STATUS_DOT: Record<ProtocolStepStatus, string> = {
  planned: 'bg-muted-foreground/40',
  running: 'bg-amber-500',
  done: 'bg-emerald-500',
  error: 'bg-rose-500'
};

/** Map a step status to the shared WorkflowNode status so the ring reflects it. */
const STATUS_TO_NODE: Record<ProtocolStepStatus, 'pending' | 'running' | 'done' | 'failed'> = {
  planned: 'pending',
  running: 'running',
  done: 'done',
  error: 'failed'
};

export function ProtocolInstanceView({ experimentId }: { experimentId: string }) {
  const t = useTranslations('protocolTemplates');
  const tenantId = useTenantId();
  const { instance, loading } = useProtocolInstance(experimentId);
  const { templates, isLoading: templatesLoading } = useProtocolTemplates();
  const [templateId, setTemplateId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedStep = instance?.steps.find((s) => s.id === selectedId) ?? null;

  const patchStep = useCallback(
    (patch: Partial<ProtocolInstanceStep>) => {
      if (!instance || !tenantId || !selectedId) return;
      const steps = instance.steps.map((s) => (s.id === selectedId ? { ...s, ...patch } : s));
      void updateInstanceSteps(tenantId, experimentId, steps);
    },
    [instance, tenantId, selectedId, experimentId]
  );

  const edges = useMemo<WfEdge[]>(
    () =>
      instance ? instance.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) : [],
    [instance]
  );

  const nodes = useMemo<WfNode[]>(() => {
    if (!instance) return [];
    const wf: WfNode[] = instance.steps.map((s) => ({
      id: s.id,
      position: { x: 0, y: 0 },
      data: {
        label: s.label,
        kind: s.kind,
        status: STATUS_TO_NODE[s.status],
        inputs: s.inputs,
        ...(s.subtitle ? { subtitle: s.subtitle } : {})
      }
    }));
    return layoutLayered(wf, edges);
  }, [instance, edges]);

  if (loading) return <ListSkeleton />;

  if (!instance) {
    return (
      <div className='max-w-md space-y-3 rounded-lg border p-4'>
        <div>
          <p className='text-sm font-medium'>{t('instanceAttachTitle')}</p>
          <p className='mt-0.5 text-xs text-muted-foreground'>{t('instanceAttachHint')}</p>
        </div>
        <Select value={templateId} onValueChange={setTemplateId} disabled={templatesLoading}>
          <SelectTrigger>
            <SelectValue placeholder={t('instanceSelectTemplate')} />
          </SelectTrigger>
          <SelectContent>
            {templates.map((tpl) => (
              <SelectItem key={tpl.id} value={tpl.id}>
                {tpl.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templates.length === 0 && !templatesLoading && (
          <p className='text-xs text-muted-foreground'>{t('instanceNoTemplates')}</p>
        )}
        {error && <p className='text-xs text-rose-600'>{error}</p>}
        <Button
          size='sm'
          disabled={!templateId || creating || !tenantId}
          onClick={async () => {
            const tpl = templates.find((x) => x.id === templateId);
            if (!tpl || !tenantId) return;
            setCreating(true);
            setError(null);
            try {
              await createInstanceFromTemplate(tenantId, experimentId, tpl);
            } catch {
              setError(t('instanceAttachFailed'));
            } finally {
              setCreating(false);
            }
          }}
        >
          <IconPlugConnected className='mr-1.5 size-4' />
          {creating ? t('instanceAttaching') : t('instanceAttach')}
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-sm'>
          <span className='text-muted-foreground'>{t('instanceFromTemplate')} </span>
          <span className='font-medium'>{instance.templateName}</span>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground'>
          {(['planned', 'running', 'done', 'error'] as ProtocolStepStatus[]).map((s) => (
            <span key={s} className='inline-flex items-center gap-1'>
              <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
              {t(`status_${s}`)}
            </span>
          ))}
        </div>
      </div>
      <div className='flex gap-3'>
        <WorkflowGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={setSelectedId}
          className='h-[460px] flex-1 rounded-lg border'
        />
        {selectedStep && (
          <ProtocolInstanceInspector
            key={selectedStep.id}
            step={selectedStep}
            onPatch={patchStep}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      <p className='text-[11px] text-muted-foreground'>{t('instanceEditHint')}</p>
    </div>
  );
}
