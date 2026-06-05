'use client';

/**
 * Shared node-graph engine (ADR-049). Wraps @xyflow/react with a domain node
 * renderer (process vs data, status-coloured) and a read-only base. Reused by
 * Protocol and DFT/Computation; manuscript is linear and does NOT use this.
 *
 * License: @xyflow/react is MIT. The attribution badge is kept (hideAttribution
 * left at its default) — removing it without sponsoring is discouraged by the
 * maintainers; revisit if we sponsor React Flow.
 */
import { Background, Controls, Handle, type NodeProps, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import type { WfEdge, WfNode, WorkflowNodeStatus } from '@/features/workflow/types';
import { cn } from '@/lib/utils';

const STATUS_RING: Record<WorkflowNodeStatus, string> = {
  pending: 'ring-border',
  running: 'ring-blue-400',
  done: 'ring-emerald-400',
  failed: 'ring-red-400',
  skipped: 'ring-muted'
};

/** One node card. Process = solid card; data = dashed + muted (AiiDA principle). */
function WorkflowNodeCard({ data }: NodeProps<WfNode>) {
  const isData = data.kind === 'data';
  const ring = data.status ? STATUS_RING[data.status] : 'ring-border';
  return (
    <div
      className={cn(
        'min-w-[160px] max-w-[220px] rounded-lg px-3 py-2 text-xs shadow-sm ring-1',
        ring,
        isData
          ? 'border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground'
          : 'bg-card text-card-foreground'
      )}
    >
      <Handle type='target' position={Position.Left} className='!bg-muted-foreground' />
      <p className='truncate font-medium'>{data.label}</p>
      {data.subtitle && <p className='mt-0.5 truncate text-[10px] opacity-70'>{data.subtitle}</p>}
      <Handle type='source' position={Position.Right} className='!bg-muted-foreground' />
    </div>
  );
}

// Defined at module scope so React Flow doesn't see a new object each render.
const nodeTypes = { workflow: WorkflowNodeCard };

export function WorkflowGraph({
  nodes,
  edges,
  onNodeClick,
  className
}: {
  nodes: WfNode[];
  edges: WfEdge[];
  onNodeClick?: (id: string) => void;
  className?: string;
}) {
  // Force every node through our renderer.
  const typedNodes = useMemo(() => nodes.map((n) => ({ ...n, type: 'workflow' })), [nodes]);
  return (
    <div className={cn('h-[480px] w-full rounded-lg border bg-background', className)}>
      <ReactFlow
        nodes={typedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onNodeClick)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
