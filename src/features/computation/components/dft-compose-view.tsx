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

import { IconLoader2, IconRocket, IconDeviceFloppy } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
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
import type { BandsPathPoint } from '@/features/computation/bands-path';
import type { WorkflowEdge, WorkflowNodeInput } from '@/features/workflow/types/workflow';
import { Link, useRouter } from '@/i18n/navigation';
import type { DftCalcType, DftWorkflowGlobal } from '@/types/dft';
import type { DftComposeState } from '@/types/dft-project';
import { formatFormula } from '@/lib/utils/format-formula';
import {
  ARCHETYPES,
  buildDefinition,
  buildUnitParams,
  defaultFlavor,
  EXE_OF,
  nodesFor,
  type ComposeNode,
  type NodeParams
} from '../compose-model';
import { ComposeInputPreview } from './compose-input-preview';
import { MachinePickerDialog } from './machine-picker-dialog';
import { ComposeNodeEditor } from './compose-node-editor';
import { GlobalSettingsEditor } from './global-settings-editor';
import { KpathEditor } from './kpath-editor';

interface RunRef {
  id: string;
  name: string;
}
interface StructureRef {
  id: string;
  name: string;
  formula: string;
  mpId?: string;
}
type SrcState = 'idle' | 'loading' | 'ready' | 'error';

function previewOf(n: ComposeNode): string {
  const exe = EXE_OF[n.calcType] ?? 'pw.x';
  if (exe === 'pw.x' && n.calcType !== 'bands') return `${exe} · ${n.params.kgrid.join('×')}`;
  return exe;
}

/** Coerce free text into a valid run id: lowercase, non [a-z0-9-] → hyphen, no
 *  leading hyphen, ≤64 chars. Matches the validId regex below. */
function normalizeRunId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64);
}

/** The nearest transitive relax/vc-relax ancestor of a unit (by dependsOn), if
 * any — its relaxed output replaces this unit's atomic positions at runtime. */
function upstreamRelaxOf(unitId: string, nodes: ComposeNode[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [...(byId.get(unitId)?.dependsOn ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (!n) continue;
    if (n.calcType === 'relax' || n.calcType === 'vc-relax') return n.calcType;
    stack.push(...n.dependsOn);
  }
  return null;
}

/** Slugify a name into a job-id-safe token (lowercase, hyphenated, ≤24 chars). */
function jobSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

export function DftComposeView({
  runs,
  structures,
  initialStructureId,
  projectId,
  projects = [],
  savedStates = []
}: {
  runs: RunRef[];
  structures: StructureRef[];
  initialStructureId?: string;
  projectId?: string;
  projects?: { id: string; name: string; structureIds: string[] }[];
  savedStates?: DftComposeState[];
}) {
  const t = useTranslations('computation');
  const router = useRouter();
  const initialSource = initialStructureId
    ? `cs:${initialStructureId}`
    : runs[0]
      ? `run:${runs[0].id}`
      : '';
  const [sourceId, setSourceId] = useState(initialSource);
  const [structure, setStructure] = useState<unknown>(null);
  const [globalCfg, setGlobalCfg] = useState<DftWorkflowGlobal | null>(null);
  const [srcState, setSrcState] = useState<SrcState>('idle');
  const [previewOk, setPreviewOk] = useState<boolean>(true);
  const [archId, setArchId] = useState(ARCHETYPES[0].id);
  const [nodes, setNodes] = useState<ComposeNode[]>(() => nodesFor(ARCHETYPES[0]));
  const [selectedId, setSelectedId] = useState<string | null>(
    ARCHETYPES[0].skeleton[0]?.id ?? null
  );
  const [runId, setRunId] = useState('');
  const [preset, setPreset] = useState<string>('bulk-large');
  const [pickedProject, setPickedProject] = useState<string>(projectId ?? '');
  const activeProject = projects.find((p) => p.id === (pickedProject || projectId)) ?? null;
  // Structures belonging to the picked project (for the second dropdown).
  const projectStructureRefs = activeProject
    ? structures.filter((st) => activeProject.structureIds.includes(st.id))
    : [];
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedUpdatedAt, setSavedUpdatedAt] = useState<number | null>(null);
  // Snapshot of what was last saved, to detect unsaved changes (dirty state).
  const [savedSig, setSavedSig] = useState<string | null>(null);

  async function loadSource(value: string) {
    setSourceId(value);
    if (!value) return;
    setSrcState('loading');
    const sep = value.indexOf(':');
    const kind = sep === -1 ? 'run' : value.slice(0, sep);
    const id = sep === -1 ? value : value.slice(sep + 1);
    const url = kind === 'cs' ? `/api/structures/${id}/definition` : '/api/dft/definition';
    const body = kind === 'cs' ? {} : { workflowId: id };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setSrcState('error');
        return;
      }
      const data = (await res.json()) as { structure: unknown; global: DftWorkflowGlobal };
      setStructure(data.structure);
      setGlobalCfg(data.global);
      setSrcState('ready');
    } catch {
      setSrcState('error');
    }
  }

  // Seeded from the structure library ("Run DFT" on a structure) — load it now
  // so the composer lands ready without a manual pick.
  useEffect(() => {
    if (initialStructureId) void loadSource(`cs:${initialStructureId}`);
    // Restore the most recent saved compose state for this structure, if any.
    if (initialStructureId && savedStates.length > 0) {
      const mine = savedStates
        .filter((st) => st.structureId === initialStructureId)
        .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      const latest = mine[0];
      if (latest) {
        try {
          setNodes(latest.nodes as ComposeNode[]);
          if (latest.global) setGlobalCfg(latest.global as DftWorkflowGlobal);
          if (latest.runId) setRunId(latest.runId);
          if (latest.selectedId !== undefined) setSelectedId(latest.selectedId ?? null);
          setSavedUpdatedAt(latest.updatedAt);
          setSavedSig(
            JSON.stringify({
              nodes: latest.nodes,
              globalCfg: latest.global,
              runId: latest.runId,
              sourceId: `cs:${latest.structureId}`
            })
          );
        } catch {
          /* ignore malformed saved state */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function changeNodeType(nodeId: string, calcType: DftCalcType) {
    setNodes((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, calcType, flavor: defaultFlavor(calcType) } : n))
    );
  }

  function changeNodeFlavor(nodeId: string, flavor: string) {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, flavor } : n)));
  }

  function setNodeKpath(nodeId: string, kpath: BandsPathPoint[]) {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, kpath } : n)));
  }

  function cloneNode(nodeId: string) {
    setNodes((ns) => {
      const target = ns.find((n) => n.id === nodeId);
      if (!target) return ns;
      const used = new Set(ns.map((n) => n.id));
      let k = ns.length + 1;
      while (used.has(`u${k}`)) k += 1;
      const copy: ComposeNode = {
        ...target,
        id: `u${k}`,
        params: {
          ...target.params,
          kgrid: [...target.params.kgrid] as [number, number, number]
        }
      };
      setSelectedId(copy.id);
      return [...ns, copy];
    });
  }

  function deleteNode(nodeId: string) {
    setNodes((ns) => {
      if (ns.length <= 1) return ns;
      const target = ns.find((n) => n.id === nodeId);
      if (!target) return ns;
      const parents = target.dependsOn;
      // Re-point anything that depended on the deleted node to its parents so the
      // chain stays connected (e.g. delete scf → nscf now depends on vc-relax).
      return ns
        .filter((n) => n.id !== nodeId)
        .map((n) =>
          n.dependsOn.includes(nodeId)
            ? {
                ...n,
                dependsOn: [...new Set([...n.dependsOn.filter((d) => d !== nodeId), ...parents])]
              }
            : n
        );
    });
    setSelectedId((cur) => (cur === nodeId ? null : cur));
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

  const species = useMemo(() => {
    const s = structure as { atomicSpecies?: { element: string }[] } | null;
    return Array.from(new Set((s?.atomicSpecies ?? []).map((a) => a.element)));
  }, [structure]);

  const validId = /^[a-z0-9][a-z0-9-]{2,63}$/.test(runId);
  const sourceStructureId = sourceId.startsWith('cs:') ? sourceId.slice(3) : null;
  const activeStructureName =
    structures.find((st) => st.id === sourceStructureId)?.name ?? sourceStructureId ?? '';
  // Job id = project-structure-runId when composing inside a project (keeps job
  // names unique + traceable), else just the runId.
  const effectiveJobId = activeProject
    ? [jobSlug(activeProject.name), jobSlug(activeStructureName), runId]
        .filter(Boolean)
        .join('-')
        .slice(0, 63)
    : runId;
  const canLaunch = validId && srcState === 'ready' && !busy;

  const srcMsg =
    srcState === 'loading'
      ? t('composeLoading')
      : srcState === 'error'
        ? t('composeError')
        : srcState === 'ready'
          ? t('composeReady')
          : '';

  // Signature of the current compose — compared to the last saved one to flag
  // unsaved changes. Excludes preset (a launch-time choice, not part of state).
  const composeSig = JSON.stringify({ nodes, globalCfg, runId, sourceId });
  const dirty = savedSig !== null && composeSig !== savedSig;
  const effectiveProjectId = pickedProject || projectId;
  const canSave = Boolean(effectiveProjectId && sourceStructureId && validId && !saving);

  async function save() {
    if (!effectiveProjectId || !sourceStructureId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dft/projects/compose-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: effectiveProjectId,
          structureId: sourceStructureId,
          runId,
          nodes,
          global: globalCfg,
          selectedId
        })
      });
      const data = (await res.json().catch(() => ({}))) as { updatedAt?: number; error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? t('composeSaveError') });
        return;
      }
      setSavedSig(composeSig);
      setSavedUpdatedAt(data.updatedAt ?? Date.now());
      setFeedback({ ok: true, text: t('composeSaved') });
    } catch {
      setFeedback({ ok: false, text: t('composeSaveError') });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function launch() {
    if (!canLaunch) return;
    // The launched workflow is built from live compose state (definition), so it
    // always reflects the latest edits — there is no separate save step. But if the
    // input preview last failed to render, the .in likely has an error QE will
    // reject; confirm before spending a VM on it.
    if (!previewOk && !window.confirm(t('composeInputWarnLaunch'))) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dft/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: effectiveJobId,
          machinePreset: preset,
          workflow: definition
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? t('newError') });
        return;
      }
      router.push(`/dashboard/computation/${effectiveJobId}`);
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: t('newError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-x-6 gap-y-3'>
        <div className='flex flex-wrap items-start gap-x-6 gap-y-3'>
          <div className='min-w-56 space-y-1.5'>
            <Label>{t('composeProject')}</Label>
            {projects.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                <Link href='/dashboard/computation/projects' className='underline'>
                  {t('composeNoProjects')}
                </Link>
              </p>
            ) : (
              <div className='space-y-2'>
                <Select value={pickedProject} onValueChange={setPickedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('composeProjectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((pr) => (
                      <SelectItem key={pr.id} value={pr.id}>
                        {formatFormula(pr.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sourceId.startsWith('cs:') ? sourceId : ''}
                  onValueChange={loadSource}
                  disabled={!pickedProject}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('composeStructurePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {projectStructureRefs.length === 0 ? (
                      <div className='text-muted-foreground px-2 py-1.5 text-xs'>
                        {t('composeProjectEmpty')}
                      </div>
                    ) : (
                      projectStructureRefs.map((s) => (
                        <SelectItem key={s.id} value={`cs:${s.id}`}>
                          {formatFormula(s.mpId ? `${s.formula ?? s.name} · ${s.mpId}` : s.name)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
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
        <div className='flex flex-wrap items-start gap-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='compose-run-id'>{t('computeRunId')}</Label>
            <Input
              id='compose-run-id'
              value={runId}
              onChange={(e) => setRunId(normalizeRunId(e.target.value))}
              placeholder='e.g. ws2-electronic-1'
              className='w-56'
            />
            <p
              className={
                runId && !validId ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
              }
            >
              {t('composeRunIdHint')}
            </p>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('computeMachine')}</Label>
            <MachinePickerDialog value={preset} onChange={setPreset} />
          </div>
          <div className='space-y-1.5'>
            <Label className='invisible' aria-hidden>
              {t('composeLaunch')}
            </Label>
            <div className='flex items-center gap-2'>
              {effectiveProjectId ? (
                <Button variant='outline' onClick={() => void save()} disabled={!canSave}>
                  {saving ? (
                    <IconLoader2 className='mr-1 size-4 animate-spin' />
                  ) : (
                    <IconDeviceFloppy className='mr-1 size-4' />
                  )}
                  {t('composeSave')}
                  {dirty ? <span className='ml-1 size-1.5 rounded-full bg-amber-500' /> : null}
                </Button>
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
            {effectiveProjectId && savedUpdatedAt ? (
              <p className='text-muted-foreground text-[11px]'>
                {dirty
                  ? t('composeUnsaved')
                  : t('composeSavedAt', { time: new Date(savedUpdatedAt).toLocaleString() })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {feedback ? (
        <p className={feedback.ok ? 'text-xs text-emerald-600' : 'text-destructive text-xs'}>
          {feedback.text}
        </p>
      ) : null}
      {srcMsg ? <p className='text-muted-foreground text-xs'>{srcMsg}</p> : null}

      {globalCfg ? (
        <GlobalSettingsEditor value={globalCfg} species={species} onChange={setGlobalCfg} />
      ) : null}

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
                showMiniMap={false}
              />
            </div>
            <div className='shrink-0 lg:w-96'>
              {selNode ? (
                <div className='max-h-[78vh] space-y-3 overflow-y-auto pr-1'>
                  <ComposeInputPreview
                    key={selNode.id}
                    calcType={selNode.calcType}
                    structure={structure}
                    global={globalCfg}
                    params={buildUnitParams(selNode, globalCfg)}
                    unitId={selNode.id}
                    upstreamRelax={upstreamRelaxOf(selNode.id, nodes)}
                    onStatus={(st) => setPreviewOk(st.ok)}
                  />
                  <ComposeNodeEditor
                    node={selNode}
                    canDelete={nodes.length > 1}
                    structure={structure}
                    pseudoMap={globalCfg?.pseudoMap}
                    nspin={selNode.params.nspin}
                    onChange={(p) => updateNode(selNode.id, p)}
                    onChangeType={(ct) => changeNodeType(selNode.id, ct)}
                    onChangeFlavor={(f) => changeNodeFlavor(selNode.id, f)}
                    onClone={() => cloneNode(selNode.id)}
                    onDelete={() => deleteNode(selNode.id)}
                  />
                  {selNode.calcType === 'bands' ? (
                    <KpathEditor
                      key={`${selNode.id}-kpath`}
                      structure={structure}
                      path={selNode.kpath}
                      onChange={(kp) => setNodeKpath(selNode.id, kp)}
                    />
                  ) : null}
                </div>
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
    </div>
  );
}
