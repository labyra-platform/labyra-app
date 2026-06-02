'use client';

/**
 * Manuscript node canvas (React Flow). Horizontal pipeline, left→right:
 *   START (references collection + template) → IMRaD section nodes → END.
 *
 * The set of section nodes is driven by `manuscript.pipelineSections` (full IMRaD
 * or a user-chosen subset; absent/empty = full). Toggle via the "Sections" menu.
 * Each SECTION node reuses the streaming generate flow (R289): stream live text,
 * save the draft, surface deterministic grounding warnings (R276). The live
 * manuscript is provided via React context — React.memo on React Flow nodes does
 * NOT block context-driven re-renders, so nodes refresh after a section is saved
 * and the query is invalidated, while drag positions persist in local state.
 *
 * END shows draft progress; publisher formatting + export land in N4. The R&D
 * data-asset / spectra picker arrives in N3.
 *
 * @phase R-aiscience-N2
 * @see labyra-ai-science-manuscript-strategy.md §4 (node pipeline)
 */
import {
  Background,
  ControlButton,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  IconChartHistogram,
  IconChevronDown,
  IconDownload,
  IconFileText,
  IconLayoutColumns,
  IconMaximize,
  IconMinimize,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconViewfinder,
  IconX
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { streamManuscriptSection } from '@/features/manuscript/generate-client';
import type {
  Manuscript,
  ManuscriptSection,
  ManuscriptSectionType
} from '@/features/manuscript/types';
import { useManuscripts } from '@/features/manuscript/use-manuscripts';
import { useCollections } from '@/features/papers/collections/use-collections';
import {
  buildBibtex,
  buildLatex,
  buildMarkdown,
  collectCitations,
  type ExportPaperMeta
} from '@/lib/ai/manuscript/export';
import { IMRAD_ORDER } from '@/lib/ai/manuscript/section-order';
import { useTenantId } from '@/lib/auth';
import { updateManuscriptMeta, upsertManuscriptSection } from '@/lib/firestore/queries/manuscripts';
import { usePapers } from '@/lib/firestore/queries/papers';
import { useAllSpectra } from '@/lib/firestore/queries/spectra';
import { cn } from '@/lib/utils';

const SECTION_LABEL_KEY: Record<ManuscriptSectionType, string> = {
  abstract: 'sectionAbstract',
  introduction: 'sectionIntroduction',
  materials: 'sectionMaterials',
  methods: 'sectionMethods',
  results_discussion: 'sectionResultsDiscussion',
  conclusion: 'sectionConclusion'
};

const NODE_GAP_X = 340;

const CanvasContext = createContext<Manuscript | null>(null);
function useManuscript(): Manuscript {
  const m = useContext(CanvasContext);
  if (!m) throw new Error('CanvasContext is missing a provider');
  return m;
}

function pipelineOf(manuscript: Manuscript): ManuscriptSectionType[] {
  return manuscript.pipelineSections && manuscript.pipelineSections.length > 0
    ? manuscript.pipelineSections
    : [...IMRAD_ORDER];
}

function buildNodes(sections: ManuscriptSectionType[]): Node[] {
  const list: Node[] = [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} }];
  sections.forEach((type, i) => {
    list.push({
      id: type,
      type: 'section',
      position: { x: (i + 1) * NODE_GAP_X, y: 0 },
      data: { sectionType: type }
    });
  });
  list.push({
    id: 'end',
    type: 'end',
    position: { x: (sections.length + 1) * NODE_GAP_X, y: 0 },
    data: {}
  });
  return list;
}

function buildEdges(sections: ManuscriptSectionType[]): Edge[] {
  const chain = ['start', ...sections, 'end'];
  const out: Edge[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const source = chain[i];
    const target = chain[i + 1];
    if (source && target) {
      out.push({ id: `${source}->${target}`, source, target, animated: true });
    }
  }
  return out;
}

function StartNode() {
  const t = useTranslations('manuscript');
  const manuscript = useManuscript();
  const { collections } = useCollections();
  const collection = collections.find((c) => c.id === manuscript.collectionId);
  return (
    <div className='w-64 rounded-lg border-2 border-primary/40 bg-card p-3 shadow-sm'>
      <div className='mb-1.5 text-sm font-semibold'>{t('nodeStart')}</div>
      <p className='truncate text-xs text-muted-foreground'>
        {t('nodeSource')}: {collection?.name ?? '—'}
      </p>
      <p className='truncate text-xs text-muted-foreground'>
        {t('nodeTemplate')}: {manuscript.journalProfileId}
      </p>
      <Handle type='source' position={Position.Right} />
    </div>
  );
}

function MeasurementPicker() {
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const manuscript = useManuscript();
  const { spectra } = useAllSpectra();
  const selected = manuscript.selectedMeasurementIds;

  async function toggle(id: string) {
    if (!tenantId) return;
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    try {
      await updateManuscriptMeta(tenantId, manuscript.id, { selectedMeasurementIds: next });
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='sm' variant='outline' className='nodrag mb-2 w-full justify-start'>
          <IconChartHistogram className='size-3.5' />
          {t('dataPick', { count: selected.length })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='max-h-72 w-64 overflow-y-auto'>
        <DropdownMenuLabel>{t('dataPickTitle')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {spectra.length === 0 ? (
          <div className='px-2 py-1.5 text-xs text-muted-foreground'>{t('dataEmpty')}</div>
        ) : (
          spectra.map((sp) => (
            <DropdownMenuCheckboxItem
              key={sp.id}
              checked={selected.includes(sp.id)}
              onCheckedChange={() => void toggle(sp.id)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className='truncate'>
                {sp.chemicalFormula ?? sp.sampleLabel ?? sp.originalFilename}
              </span>
              <Badge variant='secondary' className='ml-auto shrink-0 text-[10px]'>
                {sp.spectrumType}
              </Badge>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionNode({ data }: NodeProps) {
  const { sectionType } = data as { sectionType: ManuscriptSectionType };
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const manuscript = useManuscript();
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const section = manuscript.sections.find((s) => s.type === sectionType);

  async function generate() {
    if (!tenantId || generating) return;
    setGenerating(true);
    setStreamText('');
    try {
      const result = await streamManuscriptSection({
        manuscript,
        sectionType,
        onDelta: (d) => setStreamText((prev) => prev + d)
      });
      const next: ManuscriptSection = {
        type: sectionType,
        order: IMRAD_ORDER.indexOf(sectionType),
        content: result.draft,
        status: 'draft',
        citations: result.citations,
        linkedMeasurementIds: [],
        generatedByTier: 4,
        sectionVersion: (section?.sectionVersion ?? 0) + 1
      };
      await upsertManuscriptSection(tenantId, manuscript.id, manuscript.sections, next);
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
      const { invalidCitations, unverifiedNumbers, totalWarnings } = result.grounding;
      if (totalWarnings > 0) {
        toast.warning(t('groundingWarn', { count: totalWarnings }), {
          description: t('groundingDetail', {
            cites: invalidCitations.length,
            nums: unverifiedNumbers.length
          })
        });
      } else {
        toast.success(t('sectionDone'));
      }
    } catch {
      toast.error(t('generateFailed'));
    } finally {
      setGenerating(false);
      setStreamText('');
    }
  }

  async function removeSection() {
    if (!tenantId) return;
    const active = pipelineOf(manuscript);
    if (active.length <= 1) {
      toast.error(t('sectionsMin'));
      return;
    }
    try {
      await updateManuscriptMeta(tenantId, manuscript.id, {
        pipelineSections: active.filter((s) => s !== sectionType)
      });
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  return (
    <div className='w-64 rounded-lg border bg-card p-3 shadow-sm'>
      <Handle type='target' position={Position.Left} />
      <div className='mb-1.5 flex items-center justify-between gap-2'>
        <span className='truncate text-sm font-medium'>{t(SECTION_LABEL_KEY[sectionType])}</span>
        <div className='flex shrink-0 items-center gap-1'>
          {section && (
            <Badge variant='secondary' className='text-[10px]'>
              {section.status}
            </Badge>
          )}
          <button
            type='button'
            aria-label={t('removeSection')}
            title={t('removeSection')}
            className='nodrag rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive'
            onClick={() => void removeSection()}
          >
            <IconX className='size-3.5' />
          </button>
        </div>
      </div>
      {sectionType === 'results_discussion' && <MeasurementPicker />}
      <p className='mb-2 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground'>
        {generating ? streamText || t('generating') : section ? section.content : t('notGenerated')}
      </p>
      <Button
        size='sm'
        variant={section ? 'outline' : 'default'}
        className='nodrag w-full'
        disabled={generating}
        onClick={() => void generate()}
      >
        {section ? <IconRefresh className='size-3.5' /> : <IconSparkles className='size-3.5' />}
        {section ? t('regenerate') : t('generate')}
      </Button>
      <Handle type='source' position={Position.Right} />
    </div>
  );
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function EndNode() {
  const t = useTranslations('manuscript');
  const manuscript = useManuscript();
  const { papers } = usePapers();
  const pipeline = pipelineOf(manuscript);
  const drafted = pipeline.filter((type) =>
    manuscript.sections.some((s) => s.type === type && s.content.trim().length > 0)
  ).length;
  const hasDraft = manuscript.sections.some((s) => s.content.trim().length > 0);

  function exportAs(fmt: 'md' | 'tex' | 'bib') {
    const paperById = new Map(papers.map((pp): [string, ExportPaperMeta] => [pp.id, pp]));
    const cited = collectCitations(manuscript, paperById);
    const slug =
      manuscript.title
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 40) || 'manuscript';
    if (fmt === 'bib') {
      downloadText(`${slug}.bib`, buildBibtex(cited));
    } else if (fmt === 'tex') {
      downloadText(`${slug}.tex`, buildLatex(manuscript, cited));
    } else {
      downloadText(`${slug}.md`, buildMarkdown(manuscript, cited));
    }
  }

  return (
    <div className='w-64 rounded-lg border-2 border-dashed p-3 text-center'>
      <Handle type='target' position={Position.Left} />
      <div className='text-sm font-semibold'>{t('nodeExport')}</div>
      <p className='mt-0.5 mb-2 text-xs font-medium'>
        {t('nodeProgress', { done: drafted, total: pipeline.length })}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size='sm' variant='outline' className='nodrag w-full' disabled={!hasDraft}>
            <IconDownload className='size-3.5' />
            {t('exportBtn')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='center' className='w-48'>
          <DropdownMenuItem onClick={() => exportAs('md')}>{t('exportMd')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAs('tex')}>{t('exportTex')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportAs('bib')}>{t('exportBib')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ManuscriptSwitcher({
  currentId,
  onSelect
}: {
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('manuscript');
  const { manuscripts } = useManuscripts();
  const current = manuscripts.find((m) => m.id === currentId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='sm' variant='outline' className='max-w-52'>
          <IconFileText className='size-3.5 shrink-0' />
          <span className='truncate'>{current?.title ?? t('selectOrCreate')}</span>
          <IconChevronDown className='size-3.5 shrink-0 opacity-60' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='max-h-72 w-56 overflow-y-auto'>
        {manuscripts.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(m.id === currentId && 'bg-accent')}
          >
            <IconFileText className='size-4 shrink-0 text-muted-foreground' />
            <span className='truncate'>{m.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FitViewButton() {
  const { fitView } = useReactFlow();
  const t = useTranslations('manuscript');
  return (
    <ControlButton
      onClick={() => void fitView({ duration: 300, padding: 0.2 })}
      title={t('fitView')}
    >
      <IconViewfinder />
    </ControlButton>
  );
}

function TopLeftControls({
  focused,
  onSelectManuscript
}: {
  focused?: boolean;
  onSelectManuscript?: (id: string) => void;
}) {
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const manuscript = useManuscript();
  const active = pipelineOf(manuscript);
  const available = IMRAD_ORDER.filter((type) => !active.includes(type));

  async function add(type: ManuscriptSectionType) {
    if (!tenantId) return;
    const next = IMRAD_ORDER.filter((s) => active.includes(s) || s === type);
    try {
      await updateManuscriptMeta(tenantId, manuscript.id, { pipelineSections: next });
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  return (
    <Panel position='top-left'>
      <div className='flex gap-2'>
        {focused && onSelectManuscript && (
          <ManuscriptSwitcher currentId={manuscript.id} onSelect={onSelectManuscript} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='sm' variant='outline' disabled={available.length === 0}>
              <IconPlus className='size-3.5' />
              {t('addSection')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='w-52'>
            {available.map((type) => (
              <DropdownMenuItem key={type} onClick={() => void add(type)}>
                {t(SECTION_LABEL_KEY[type])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Panel>
  );
}

function CanvasTopRightControls({
  onReset,
  focused,
  onToggleFocused
}: {
  onReset: () => void;
  focused?: boolean;
  onToggleFocused?: () => void;
}) {
  const { fitView } = useReactFlow();
  const t = useTranslations('manuscript');
  const refit = () => requestAnimationFrame(() => void fitView({ duration: 300, padding: 0.2 }));
  return (
    <Panel position='top-right'>
      <div className='flex gap-2'>
        {onToggleFocused && (
          <Button
            size='sm'
            variant='outline'
            title={focused ? t('collapseList') : t('expandSpace')}
            aria-label={focused ? t('collapseList') : t('expandSpace')}
            onClick={() => {
              onToggleFocused();
              refit();
            }}
          >
            {focused ? (
              <IconMinimize className='size-3.5' />
            ) : (
              <IconMaximize className='size-3.5' />
            )}
          </Button>
        )}
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            onReset();
            refit();
          }}
        >
          <IconLayoutColumns className='size-3.5' />
          {t('resetView')}
        </Button>
      </div>
    </Panel>
  );
}

const nodeTypes = { start: StartNode, section: SectionNode, end: EndNode };

function Flow({
  manuscript,
  focused,
  onToggleFocused,
  onSelectManuscript
}: {
  manuscript: Manuscript;
  focused?: boolean;
  onToggleFocused?: () => void;
  onSelectManuscript?: (id: string) => void;
}) {
  const pipeline = pipelineOf(manuscript);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(buildNodes(pipeline));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(pipeline));

  function reset() {
    setNodes(buildNodes(pipeline));
    setEdges(buildEdges(pipeline));
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
    >
      <TopLeftControls focused={focused} onSelectManuscript={onSelectManuscript} />
      <CanvasTopRightControls onReset={reset} focused={focused} onToggleFocused={onToggleFocused} />
      <Background />
      <Controls showFitView={false}>
        <FitViewButton />
      </Controls>
    </ReactFlow>
  );
}

export function ManuscriptCanvas({
  manuscript,
  focused,
  onToggleFocused,
  onSelectManuscript
}: {
  manuscript: Manuscript;
  focused?: boolean;
  onToggleFocused?: () => void;
  onSelectManuscript?: (id: string) => void;
}) {
  const pipelineKey = pipelineOf(manuscript).join(',');
  return (
    <CanvasContext.Provider value={manuscript}>
      <div className='h-full min-h-[32rem] w-full overflow-hidden rounded-lg border'>
        <Flow
          key={pipelineKey}
          manuscript={manuscript}
          focused={focused}
          onToggleFocused={onToggleFocused}
          onSelectManuscript={onSelectManuscript}
        />
      </div>
    </CanvasContext.Provider>
  );
}
