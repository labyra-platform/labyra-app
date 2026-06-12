/**
 * <WorkflowGraph> — shared React Flow shell (report node-graph §3.1).
 * One canvas (dagre LR + dots + controls + minimap); the node renderer is
 * chosen by `domain`. "Chung khung, riêng node." External `selectedId` marks the
 * active node (selection synced with a sidebar / panel).
 *
 * @phase R252-dft-workspace-shell
 */
'use client';

import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler
} from '@xyflow/react';
import { useMemo } from 'react';
import { DftUnitNode } from '@/features/workflow/components/dft-unit-node';
import { layoutLR } from '@/features/workflow/lib/layout-lr';
import type {
  WorkflowDomain,
  WorkflowEdge,
  WorkflowNodeInput
} from '@/features/workflow/types/workflow';

const NODE_RENDERERS: Partial<Record<WorkflowDomain, typeof DftUnitNode>> = {
  dft: DftUnitNode
};

interface WorkflowGraphProps {
  domain: WorkflowDomain;
  nodes: WorkflowNodeInput[];
  edges: WorkflowEdge[];
  onNodeClick?: (id: string) => void;
  selectedId?: string | null;
  showMiniMap?: boolean;
}

export function WorkflowGraph({
  domain,
  nodes,
  edges,
  onNodeClick,
  selectedId,
  showMiniMap = true
}: WorkflowGraphProps) {
  const renderer = NODE_RENDERERS[domain] ?? DftUnitNode;
  const nodeTypes = useMemo(() => ({ wf: renderer }), [renderer]);
  const laidOut = useMemo(() => layoutLR(nodes, edges), [nodes, edges]);
  const rfNodes = useMemo(
    () =>
      laidOut.nodes.map((n) => ({
        ...n,
        selected: selectedId != null && n.id === selectedId
      })),
    [laidOut.nodes, selectedId]
  );

  const handleNodeClick: NodeMouseHandler = (_, node) => onNodeClick?.(node.id);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={laidOut.edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      minZoom={0.2}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
      {showMiniMap ? <MiniMap pannable zoomable /> : null}
    </ReactFlow>
  );
}
