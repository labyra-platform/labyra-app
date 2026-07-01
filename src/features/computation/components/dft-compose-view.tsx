/**
 * DFT composer — build a pipeline from a supported archetype, tune per-node
 * parameters, and watch the launchable workflow JSON update live before
 * launching. Structure + global are inherited from an existing run (fetched
 * server-side, small payload); the pipeline itself is composed fresh, not
 * cloned. Phonon is not offered — the worker has no ph.x (see compose-model).
 *
 * @phase R315-composer
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

export function DftComposeView({ runs }: { runs: RunRef[] }) {
  const t = useTranslations('computation');
  const router = useRouter();
  const [sourceId, setSourceId] = useState(runs[0]?.id ?? '');
  const [structure, setStructure] = useState<unknown>(null);
  const [globalCfg, setGlobalCfg] = useState<unknown>(null);
  const [srcState, setSrcState] = useState<SrcState>('idle');
  const [archId, setArchId] = useState(ARCHETYPES[0].id);
  const [nodes, setNodes] = useState<ComposeNode[]>(() => nodesFor(ARCHETYPES[0]));
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
    if (arch) setNodes(nodesFor(arch));
  }

  function updateNode(nodeId: string, params: NodeParams) {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, params } : n)));
  }

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
    <div className='grid gap-6 lg:grid-cols-2'>
      <div className='space-y-4'>
        <div className='space-y-1.5'>
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
          <p className='text-muted-foreground text-xs'>{srcMsg}</p>
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
          <p className='text-muted-foreground text-xs'>{t('composePhononNote')}</p>
        </div>

        <div className='space-y-2'>
          <Label>{t('composeNodes')}</Label>
          {nodes.map((n) => (
            <ComposeNodeEditor key={n.id} node={n} onChange={(p) => updateNode(n.id, p)} />
          ))}
        </div>
      </div>

      <div className='space-y-3'>
        <div className='space-y-1.5'>
          <Label>{t('composePreview')}</Label>
          <pre className='bg-muted max-h-[28rem] overflow-auto rounded-md p-3 font-mono text-xs'>
            {preview}
          </pre>
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='compose-run-id'>{t('computeRunId')}</Label>
            <Input
              id='compose-run-id'
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder='e.g. ws2-electronic-1'
            />
          </div>
          <div className='space-y-1.5'>
            <Label>{t('computeMachine')}</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger>
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
        </div>
        {feedback ? (
          <p className={feedback.ok ? 'text-xs text-emerald-600' : 'text-destructive text-xs'}>
            {feedback.text}
          </p>
        ) : null}
        <Button onClick={launch} disabled={!canLaunch}>
          {busy ? (
            <IconLoader2 className='mr-1 size-4 animate-spin' />
          ) : (
            <IconRocket className='mr-1 size-4' />
          )}
          {t('composeLaunch')}
        </Button>
      </div>
    </div>
  );
}
