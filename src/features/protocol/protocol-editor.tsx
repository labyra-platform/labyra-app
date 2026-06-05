'use client';

/**
 * Interactive protocol editor (ADR-049, Blender-style). Add process/data steps,
 * drag handle-to-handle to connect, click a node to edit (label/kind/detail) or
 * delete it, auto-arrange, and save the graph (steps + edges) via
 * updateProtocolGraph. Node positions are not persisted — the layered layout
 * re-tidies on load and Auto-layout re-runs it. Existing on-node inputs are
 * preserved through edits (editing them is R270d).
 *
 * @phase R270c — Protocol editor
 */
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IconDatabase, IconLayoutGrid, IconPlus } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProtocolNodeInspector } from '@/features/protocol/protocol-node-inspector';
import { layoutLayered } from '@/features/workflow/layout';
import type { WfEdge, WfNode, WorkflowNodeData, WorkflowNodeKind } from '@/features/workflow/types';
import { nodeTypes } from '@/features/workflow/workflow-graph';
import { Button } from '@/components/ui/button';
import { useTenantId } from '@/lib/auth';
import { updateProtocolGraph } from '@/lib/firestore/queries/protocol-templates';
import type { ProtocolEdge, ProtocolStep, ProtocolTemplate } from '@/types/protocol-template';

interface Props {
  template: ProtocolTemplate;
  onClose: () => void;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function ProtocolEditor({ template, onClose }: Props) {
  const t = useTranslations('protocolTemplates');
  const tenantId = useTenantId();

  const initial = useMemo(() => {
    const wf: WfNode[] = template.steps.map((s) => ({
      id: s.id,
      type: 'workflow',
      position: { x: 0, y: 0 },
      data: { label: s.label, kind: s.kind, subtitle: s.subtitle, inputs: s.inputs }
    }));
    const eds: WfEdge[] = template.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target
    }));
    return { nodes: layoutLayered(wf, eds), edges: eds };
  }, [template]);

  const [nodes, setNodes, onNodesChange] = useNodesState<WfNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WfEdge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  const addStep = (kind: WorkflowNodeKind) => {
    const id = newId('s');
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'workflow',
        position: { x: 60, y: 40 + nds.length * 24 },
        data: { label: t('newStep'), kind }
      }
    ]);
    setSelectedId(id);
  };

  const autoLayout = () => setNodes((nds) => layoutLayered(nds, edges));

  const updateSelected = (patch: Partial<WorkflowNodeData>) => {
    if (!selectedId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const save = async () => {
    if (!tenantId) {
      toast.error(t('saveFailed'));
      return;
    }
    setSaving(true);
    try {
      const steps: ProtocolStep[] = nodes.map((n) => {
        const inputs = n.data.inputs as ProtocolStep['inputs'];
        return {
          id: n.id,
          label: n.data.label,
          kind: n.data.kind,
          ...(n.data.subtitle ? { subtitle: n.data.subtitle } : {}),
          ...(inputs && inputs.length > 0 ? { inputs } : {})
        };
      });
      const eds: ProtocolEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target
      }));
      await updateProtocolGraph(tenantId, template.id, { steps, edges: eds });
      toast.success(t('graphSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='sm' variant='outline' onClick={() => addStep('process')}>
          <IconPlus className='size-4' />
          {t('addStep')}
        </Button>
        <Button size='sm' variant='outline' onClick={() => addStep('data')}>
          <IconDatabase className='size-4' />
          {t('addData')}
        </Button>
        <Button size='sm' variant='outline' onClick={autoLayout}>
          <IconLayoutGrid className='size-4' />
          {t('autoLayout')}
        </Button>
        <div className='ml-auto flex gap-2'>
          <Button size='sm' variant='ghost' onClick={onClose}>
            {t('done')}
          </Button>
          <Button size='sm' onClick={() => void save()} disabled={saving}>
            {saving ? t('saving') : t('saveGraph')}
          </Button>
        </div>
      </div>

      <div className='flex gap-3'>
        <div className='h-[480px] flex-1 rounded-lg border bg-background'>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selectedNode && (
          <ProtocolNodeInspector
            node={selectedNode}
            onChange={updateSelected}
            onDelete={deleteSelected}
          />
        )}
      </div>

      <p className='text-xs text-muted-foreground'>{t('editorHint')}</p>
    </div>
  );
}
