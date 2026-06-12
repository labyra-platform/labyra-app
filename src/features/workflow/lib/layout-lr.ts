/**
 * Horizontal (LR) DAG layout via dagre — shared by every workflow domain.
 * rankdir 'LR' with branch/merge support (DFT: scf -> nscf/dos/pdos/charge).
 *
 * @phase R258-dagre-named-imports
 */
import { graphlib, layout } from '@dagrejs/dagre';
import { Position, type Edge, type Node } from '@xyflow/react';
import type { WorkflowEdge, WorkflowNodeInput } from '@/features/workflow/types/workflow';

const NODE_W = 200;
const NODE_H = 84;

export function layoutLR(
  nodes: WorkflowNodeInput[],
  edges: WorkflowEdge[]
): { nodes: Node[]; edges: Edge[] } {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  layout(g);

  const rfNodes: Node[] = nodes.map((n) => {
    const pos = g.node(n.id);
    const x = pos ? pos.x - NODE_W / 2 : 0;
    const y = pos ? pos.y - NODE_H / 2 : 0;
    return {
      id: n.id,
      type: 'wf',
      position: { x, y },
      data: n.data,
      sourcePosition: Position.Right,
      targetPosition: Position.Left
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep'
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
