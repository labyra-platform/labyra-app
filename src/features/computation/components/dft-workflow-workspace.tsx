/**
 * DFT workflow workspace — 3-zone layout (report DFT §10.1).
 *   left rail (units + pseudopotentials) | canvas tabs [Overview|Settings|Compute]
 *   | node panel. Selection syncs between the rail, the canvas, and the panel.
 *
 * Overview = LR status DAG. Settings = read-only globals. Compute = backend +
 * Launch (§10.5). Node panel = Details + grouped params + auto .in preview.
 *
 * @phase R263-left-rail-pseudo
 */
'use client';

import {
  IconCircleCheck,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DftBandsTab } from '@/features/computation/components/dft-bands-tab';
import { DftConvergenceTab } from '@/features/computation/components/dft-convergence-tab';
import { DftResultsTab } from '@/features/computation/components/dft-results-tab';
import { DftComputeTab } from '@/features/computation/components/dft-compute-tab';
import { DftPrelaunchChecklist } from '@/features/computation/components/dft-prelaunch-checklist';
import { DftNodePanel } from '@/features/computation/components/dft-node-panel';
import { DownloadWorkflowJson } from '@/features/computation/components/download-workflow-json';
import { DftWorkflowGraph } from '@/features/workflow/components/dft-workflow-graph';
import type { DftWorkflow } from '@/types/dft';

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  running: 'bg-amber-500',
  queued: 'bg-muted-foreground/50',
  pending: 'bg-muted-foreground/40',
  failed: 'bg-destructive'
};

export function DftWorkflowWorkspace({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRail, setShowRail] = useState(true);
  const units = useMemo(() => workflow.units ?? [], [workflow.units]);
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedId) ?? null,
    [units, selectedId]
  );
  const g = workflow.global;
  const species = workflow.structure?.atomicSpecies ?? [];

  return (
    <div className='flex h-[78vh] overflow-hidden rounded-lg border'>
      <aside
        className={showRail ? 'flex w-56 shrink-0 flex-col overflow-y-auto border-r' : 'hidden'}
      >
        <div className='border-b p-3'>
          <p className='truncate text-sm font-medium'>{g?.prefix ?? workflow.id}</p>
          {workflow.overallStatus ? (
            <Badge variant='secondary' className='mt-1 text-[10px]'>
              {workflow.overallStatus}
            </Badge>
          ) : null}
        </div>
        <div className='p-2'>
          <p className='text-muted-foreground px-1 pb-1 text-xs font-medium'>{t('units')}</p>
          <ul className='space-y-0.5'>
            {units.map((u, i) => {
              const st = workflow.snapshot?.[u.id]?.status ?? 'pending';
              const active = u.id === selectedId;
              return (
                <li key={u.id}>
                  <button
                    type='button'
                    onClick={() => setSelectedId(active ? null : u.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${active ? 'bg-accent' : 'hover:bg-muted'}`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[st] ?? STATUS_DOT.pending}`}
                    />
                    <span className='text-muted-foreground text-xs tabular-nums'>
                      {String(u.order ?? i + 1).padStart(2, '0')}
                    </span>
                    <span className='flex-1 truncate'>{u.name ?? u.calcType}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {species.length > 0 ? (
          <div className='border-t p-2'>
            <p className='text-muted-foreground px-1 pb-1 text-xs font-medium'>
              {t('pseudopotentials')}
            </p>
            <ul className='space-y-0.5'>
              {species.map((sp) => (
                <li key={sp.element} className='flex items-center gap-2 px-2 py-1 text-sm'>
                  <IconCircleCheck
                    className='size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400'
                    aria-hidden
                  />
                  <span className='font-medium'>{sp.element}</span>
                  {sp.pseudoFile ? (
                    <span className='text-muted-foreground truncate font-mono text-[10px]'>
                      {sp.pseudoFile}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <div className='flex min-w-0 flex-1 flex-col'>
        <Tabs defaultValue='overview' className='flex flex-1 flex-col gap-0'>
          <div className='flex items-center gap-1 border-b px-2'>
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              onClick={() => setShowRail((v) => !v)}
              aria-label={showRail ? t('railCollapse') : t('railExpand')}
            >
              {showRail ? (
                <IconLayoutSidebarLeftCollapse className='size-4' />
              ) : (
                <IconLayoutSidebarLeftExpand className='size-4' />
              )}
            </Button>
            <TabsList className='h-9 bg-transparent'>
              <TabsTrigger value='overview'>{t('tabOverview')}</TabsTrigger>
              <TabsTrigger value='settings'>{t('tabSettings')}</TabsTrigger>
              <TabsTrigger value='compute'>{t('tabCompute')}</TabsTrigger>
              <TabsTrigger value='bands'>{t('tabBands')}</TabsTrigger>
              <TabsTrigger value='results'>{t('tabResults')}</TabsTrigger>
              <TabsTrigger value='convergence'>{t('tabConvergence')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value='overview' className='m-0 min-h-0 flex-1'>
            <DftWorkflowGraph
              workflow={workflow}
              selectedId={selectedId}
              onNodeClick={(id) => setSelectedId(id)}
              className='h-full w-full'
            />
          </TabsContent>

          <TabsContent value='settings' className='m-0 flex-1 space-y-4 overflow-y-auto p-4'>
            <DownloadWorkflowJson workflow={workflow} />
            <dl className='grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm'>
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>{t('functional')}</dt>
                <dd className='uppercase'>{g?.functional ?? '—'}</dd>
              </div>
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>ecutwfc</dt>
                <dd className='tabular-nums'>{g?.ecutwfc != null ? `${g.ecutwfc} Ry` : '—'}</dd>
              </div>
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>ecutrho</dt>
                <dd className='tabular-nums'>{g?.ecutrho != null ? `${g.ecutrho} Ry` : '—'}</dd>
              </div>
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>Hubbard U</dt>
                <dd className='tabular-nums'>
                  {g?.hubbard && g.hubbard.length > 0
                    ? g.hubbard.map((h) => `${h.manifold} ${h.value}`).join(', ')
                    : '—'}
                </dd>
              </div>
            </dl>
          </TabsContent>

          <TabsContent value='compute' className='m-0 flex-1 overflow-y-auto p-4'>
            <DftPrelaunchChecklist workflow={workflow} />
            <DftComputeTab workflow={workflow} />
          </TabsContent>
          <TabsContent value='bands' className='m-0 flex-1 overflow-y-auto p-4'>
            <DftBandsTab workflow={workflow} />
          </TabsContent>
          <TabsContent value='results' className='m-0 flex-1 overflow-y-auto p-4'>
            <DftResultsTab workflow={workflow} />
          </TabsContent>
          <TabsContent value='convergence' className='m-0 flex-1 overflow-y-auto p-4'>
            <DftConvergenceTab workflow={workflow} />
          </TabsContent>
        </Tabs>
      </div>

      {selectedUnit ? (
        <DftNodePanel
          key={selectedUnit.id}
          unit={selectedUnit}
          structure={workflow.structure}
          globalConfig={workflow.global}
          ecutwfc={g?.ecutwfc}
          status={workflow.snapshot?.[selectedUnit.id]?.status}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
