'use client';

/**
 * Manuscript node canvas (React Flow). Linear pipeline, top→down:
 *   START (references collection + template) → IMRaD section nodes → END (export).
 *
 * Each SECTION node reuses the streaming generate flow (R289): stream live text,
 * save the draft, surface deterministic grounding warnings (R276). The live
 * manuscript is provided via React context — React.memo on React Flow nodes does
 * NOT block context-driven re-renders, so nodes refresh after a section is saved
 * and the query is invalidated, while node positions (drag) persist in local state.
 *
 * END is a placeholder until N4 (publisher formatting: text / tables / figures +
 * citation export). The R&D data-asset / spectra picker arrives in N3.
 *
 * @phase R-aiscience-N1
 * @see labyra-ai-science-manuscript-strategy.md §4 (node pipeline)
 */
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { streamManuscriptSection } from '@/features/manuscript/generate-client';
import type {
  Manuscript,
  ManuscriptSection,
  ManuscriptSectionType
} from '@/features/manuscript/types';
import { useCollections } from '@/features/papers/collections/use-collections';
import { IMRAD_ORDER } from '@/lib/ai/manuscript/section-order';
import { useTenantId } from '@/lib/auth';
import { upsertManuscriptSection } from '@/lib/firestore/queries/manuscripts';

const SECTION_LABEL_KEY: Record<ManuscriptSectionType, string> = {
  abstract: 'sectionAbstract',
  introduction: 'sectionIntroduction',
  materials: 'sectionMaterials',
  methods: 'sectionMethods',
  results_discussion: 'sectionResultsDiscussion',
  conclusion: 'sectionConclusion'
};

const NODE_GAP_Y = 150;

const CanvasContext = createContext<Manuscript | null>(null);
function useManuscript(): Manuscript {
  const m = useContext(CanvasContext);
  if (!m) throw new Error('CanvasContext is missing a provider');
  return m;
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
      <Handle type='source' position={Position.Bottom} />
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
      <Handle type='target' position={Position.Top} />
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
      <Handle type='source' position={Position.Bottom} />
    </div>
  );
}

function EndNode() {
  const t = useTranslations('manuscript');
  return (
    <div className='w-64 rounded-lg border-2 border-dashed p-3 text-center'>
      <Handle type='target' position={Position.Top} />
      <div className='text-sm font-semibold'>{t('nodeExport')}</div>
      <p className='mt-1 text-xs text-muted-foreground'>{t('nodeExportSoon')}</p>
    </div>
  );
}

const nodeTypes = { start: StartNode, section: SectionNode, end: EndNode };

const INITIAL_NODES: Node[] = [
  { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
  ...IMRAD_ORDER.map(
    (type, i): Node => ({
      id: type,
      type: 'section',
      position: { x: 0, y: (i + 1) * NODE_GAP_Y },
      data: { sectionType: type }
    })
  ),
  {
    id: 'end',
    type: 'end',
    position: { x: 0, y: (IMRAD_ORDER.length + 1) * NODE_GAP_Y },
    data: {}
  }
];

function buildPipelineEdges(): Edge[] {
  const chain = ['start', ...IMRAD_ORDER, 'end'];
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

const INITIAL_EDGES: Edge[] = buildPipelineEdges();

export function ManuscriptCanvas({ manuscript }: { manuscript: Manuscript }) {
  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);

  return (
    <CanvasContext.Provider value={manuscript}>
      <div className='h-[calc(100vh-13rem)] w-full overflow-hidden rounded-lg border'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  );
}
