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
import { IconLayoutColumns, IconListCheck, IconRefresh, IconSparkles } from '@tabler/icons-react';
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
import { useCollections } from '@/features/papers/collections/use-collections';
import { IMRAD_ORDER } from '@/lib/ai/manuscript/section-order';
import { useTenantId } from '@/lib/auth';
import { updateManuscriptMeta, upsertManuscriptSection } from '@/lib/firestore/queries/manuscripts';

const SECTION_LABEL_KEY: Record<ManuscriptSectionType, string> = {
  abstract: 'sectionAbstract',
  introduction: 'sectionIntroduction',
  materials: 'sectionMaterials',
  methods: 'sectionMethods',
  results_discussion: 'sectionResultsDiscussion',
  conclusion: 'sectionConclusion'
};

const NODE_GAP_X = 300;

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

  return (
    <div className='w-64 rounded-lg border bg-card p-3 shadow-sm'>
      <Handle type='target' position={Position.Left} />
      <div className='mb-1.5 flex items-center justify-between gap-2'>
        <span className='truncate text-sm font-medium'>{t(SECTION_LABEL_KEY[sectionType])}</span>
        {section && (
          <Badge variant='secondary' className='shrink-0 text-[10px]'>
            {section.status}
          </Badge>
        )}
      </div>
      <p className='mb-2 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground'>
        {generating ? streamText || t('generating') : section ? section.content : t('notGenerated')}
      </p>
      <Button
        size='sm'
        variant={section ? 'outline' : 'default'}
        className='w-full'
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

function EndNode() {
  const t = useTranslations('manuscript');
  const manuscript = useManuscript();
  const pipeline = pipelineOf(manuscript);
  const drafted = pipeline.filter((type) =>
    manuscript.sections.some((s) => s.type === type && s.content.trim().length > 0)
  ).length;
  return (
    <div className='w-64 rounded-lg border-2 border-dashed p-3 text-center'>
      <Handle type='target' position={Position.Left} />
      <div className='text-sm font-semibold'>{t('nodeExport')}</div>
      <p className='mt-0.5 text-xs font-medium'>
        {t('nodeProgress', { done: drafted, total: pipeline.length })}
      </p>
      <p className='mt-1 text-xs text-muted-foreground'>{t('nodeExportSoon')}</p>
    </div>
  );
}

function SectionsMenu() {
  const t = useTranslations('manuscript');
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const manuscript = useManuscript();
  const active = pipelineOf(manuscript);

  async function toggle(type: ManuscriptSectionType) {
    if (!tenantId) return;
    const next = active.includes(type) ? active.filter((s) => s !== type) : [...active, type];
    if (next.length === 0) {
      toast.error(t('sectionsMin'));
      return;
    }
    const ordered = IMRAD_ORDER.filter((s) => next.includes(s));
    try {
      await updateManuscriptMeta(tenantId, manuscript.id, { pipelineSections: ordered });
      await queryClient.invalidateQueries({
        queryKey: ['tenant-collection', tenantId, 'manuscripts']
      });
    } catch {
      toast.error(t('saveFailed'));
    }
  }

  return (
    <Panel position='top-left'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size='sm' variant='outline'>
            <IconListCheck className='size-3.5' />
            {t('sectionsMenu', { count: active.length })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-52'>
          <DropdownMenuLabel>{t('sectionsMenuTitle')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {IMRAD_ORDER.map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={active.includes(type)}
              onCheckedChange={() => void toggle(type)}
              onSelect={(e) => e.preventDefault()}
            >
              {t(SECTION_LABEL_KEY[type])}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Panel>
  );
}

function ResetViewButton({ onReset }: { onReset: () => void }) {
  const { fitView } = useReactFlow();
  const t = useTranslations('manuscript');
  return (
    <Panel position='top-right'>
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          onReset();
          requestAnimationFrame(() => {
            void fitView({ duration: 300 });
          });
        }}
      >
        <IconLayoutColumns className='size-3.5' />
        {t('resetView')}
      </Button>
    </Panel>
  );
}

const nodeTypes = { start: StartNode, section: SectionNode, end: EndNode };

function Flow({ manuscript }: { manuscript: Manuscript }) {
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
    >
      <SectionsMenu />
      <ResetViewButton onReset={reset} />
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export function ManuscriptCanvas({ manuscript }: { manuscript: Manuscript }) {
  const pipelineKey = pipelineOf(manuscript).join(',');
  return (
    <CanvasContext.Provider value={manuscript}>
      <div className='h-[calc(100vh-13rem)] w-full overflow-hidden rounded-lg border'>
        <Flow key={pipelineKey} manuscript={manuscript} />
      </div>
    </CanvasContext.Provider>
  );
}
