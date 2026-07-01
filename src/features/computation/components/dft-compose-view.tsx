/**
 * DFT composer — an interactive node graph. Pick a structure source + a pipeline
 * archetype; the pipeline renders as a clickable DAG (shared <WorkflowGraph>).
 * Click a node → its parameters open in the side panel (basic + advanced,
 * ComposeNodeEditor); a JSON tab shows the launchable workflow updating live.
 * Structure + global are inherited from an existing run; the pipeline is
 * composed fresh. Phonon is not offered — the worker has no ph.x.
 *
 * @phase R319-composer-graph (was R315 linear composer)
 */
'use client';

import { IconLoader2, IconRocket } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowGraph } from '@/features/workflow/components/workflow-graph';
import type { WorkflowEdge, WorkflowNodeInput } from '@/features/workflow/types/workflow';
import { useRouter } from '@/i18n/navigation';
import { DFT_MACHINE_PRESETS } from '@/lib/schemas/dft-submit-schema';
import {
  ARCHETYPES,
  buildDefinition,
  nodesFor,
  type ComposeNode,
  type NodeParams
} from '../compose-model';
import { ComposeNodeEditor } from './compose-node-editor';

interface RunRef {
  id: string;
  name: string;
}
type SrcState = 'idle' | 'loading' | 'ready' | 'error';

const EXE: Record<string, string> = {
  'vc-relax': 'pw.x',
  relax: 'pw.x',
  scf: 'pw.x',
  nscf: 'pw.x',
  bands: 'pw.x',
  ppbands: 'bands.x',
  dos: 'dos.x',
  pdos: 'projwfc.x',
  charge: 'pp.x'
};

function previewOf(n: ComposeNode): string {
  const exe = EXE[n.calcType] ?? 'pw.x';
  if (exe === 'pw.x' && n.calcType !== 'bands') return `${exe} · ${n.params.kgrid.join('×')}`;
  return exe;
}

export function DftComposeView({ runs }: { runs: RunRef[] }) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [sourceId, setSourceId] = useState(runs[0]?.id ?? '');
  const [structure, setStructure] = useState<unknown>(null);
  const [globalCfg, setGlobalCfg] = useState<unknown>(null);
  const [srcState, setSrcState] = useState<SrcState>('idle');
  const [archId, setArchId] = useState(ARCHETYPES[0].id);
  const [nodes, setNodes] = useState<ComposeNode[]>(() => nodesFor(ARCHETYPES[0]));
  const [selectedId, setSelectedId] = useState<string | null>(
    ARCHETYPES[0].skeleton[0]?.id ?? null
  );
  const [runId, setRunId] = useState('');
  const [preset, setPreset] = useState<string>(DFT_MACHINE_PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadSource(id: string) {
    setSourceId(id);
    if (!id) return;
    setSrcState('loading');
    try {
      const res = await fetch('/api/dft/definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: id })
      });
      if (!res.ok) {
        setSrcState('error');
        return;
      }
      const data = (await res.json()) as { structure: unknown; global: unknown };
      setStructure(data.structure);
      setGlobalCfg(data.global);
      setSrcState('ready');
    } catch {
      setSrcState('error');
    }
  }

  function selectArch(id: string) {
    setArchId(id);
    const arch = ARCHETYPES.find((a) => a.id === id);
    if (arch) {
      setNodes(nodesFor(arch));
      setSelectedId(arch.skeleton[0]?.id ?? null);
    }
  }

  function updateNode(nodeId: string, params: NodeParams) {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, params } : n)));
  }

  const graphNodes: WorkflowNodeInput[] = useMemo(
    () =>
      nodes.map((n, i) => ({
        id: n.id,
        data: { order: i + 1, name: n.calcType, calcType: n.calcType, preview: previewOf(n) }
      })),
    [nodes]
  );
  const graphEdges: WorkflowEdge[] = useMemo(
    () =>
      nodes.flatMap((n) =>
        n.dependsOn.map((src) => ({ id: `${src}->${n.id}`, source: src, target: n.id }))
      ),
    [nodes]
  );
  const selNode = nodes.find((n) => n.id === selectedId) ?? null;

  const definition = useMemo(
    () => buildDefinition(nodes, structure, globalCfg),
    [nodes, structure, globalCfg]
  );
  const preview = useMemo(() => JSON.stringify(definition, null, 2), [definition]);

  const validId = /^[a-z0-9][a-z0-9-]{2,63}$/.test(runId);
  const canLaunch = validId && srcState === 'ready' && !busy;

  const srcMsg =
    srcState === 'loading'
      ? t('composeLoading')
      : srcState === 'error'
        ? t('composeError')
        : srcState === 'ready'
          ? t('composeReady')
          : t('composeSourceHint');

  async function launch() {
    if (!canLaunch) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: runId, machinePreset: preset, workflow: definition })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? t('newError') });
        return;
      }
      router.push(`/dashboard/computation/${runId}`);
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('newError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end gap-x-6 gap-y-3'>
        <div className='min-w-56 space-y-1.5'>
          <Label>{t('composeSource')}</Label>
          {runs.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('composeNoRuns')}</p>
          ) : (
            <Select value={sourceId} onValueChange={loadSource}>
              <SelectTrigger>
                <SelectValue placeholder={t('composeSourcePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label>{t('composeArchetype')}</Label>
          <div className='flex flex-wrap gap-1'>
            {ARCHETYPES.map((a) => (
              <Button
                key={a.id}
                size='sm'
                variant={archId === a.id ? 'default' : 'outline'}
                onClick={() => selectArch(a.id)}
              >
                {t(a.labelKey)}
              </Button>
            ))}
            <Button size='sm' variant='outline' disabled>
              {t('archPhonon')}
            </Button>
          </div>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>{srcMsg}</p>

      <Tabs defaultValue='graph'>
        <TabsList>
          <TabsTrigger value='graph'>{t('composeTabGraph')}</TabsTrigger>
          <TabsTrigger value='json'>{t('composeTabJson')}</TabsTrigger>
        </TabsList>
        <TabsContent value='graph' className='mt-3'>
          <div className='flex flex-col gap-3 lg:flex-row'>
            <div className='bg-muted/20 h-[460px] w-full min-w-0 flex-1 rounded-lg border'>
              <WorkflowGraph
                domain='dft'
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={setSelectedId}
                selectedId={selectedId}
              />
            </div>
            <div className='shrink-0 lg:w-96'>
              {selNode ? (
                <ComposeNodeEditor node={selNode} onChange={(p) => updateNode(selNode.id, p)} />
              ) : (
                <p className='text-muted-foreground p-3 text-sm'>{t('composeSelectNode')}</p>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value='json' className='mt-3'>
          <pre className='bg-muted max-h-[28rem] overflow-auto rounded-md p-3 font-mono text-xs'>
            {preview}
          </pre>
        </TabsContent>
      </Tabs>

      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1.5'>
          <Label htmlFor='compose-run-id'>{t('computeRunId')}</Label>
          <Input
            id='compose-run-id'
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder='e.g. ws2-electronic-1'
            className='w-56'
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{t('computeMachine')}</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className='w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DFT_MACHINE_PRESETS.map((pr) => (
                <SelectItem key={pr} value={pr}>
                  {pr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={launch} disabled={!canLaunch}>
          {busy ? (
            <IconLoader2 className='mr-1 size-4 animate-spin' />
          ) : (
            <IconRocket className='mr-1 size-4' />
          )}
          {t('composeLaunch')}
        </Button>
      </div>
      {feedback ? (
        <p className={feedback.ok ? 'text-xs text-emerald-600' : 'text-destructive text-xs'}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
