/**
 * Workflow DAG editor — interactive node graph for composing a DFT workflow
 * (Mat3ra-style). Phase B1: render the default 7-unit DAG with drag / connect /
 * pan / zoom. Node palette, per-node config, and submit arrive in later phases.
 *
 * @phase R241-dag-editor
 */
'use client';

import '@xyflow/react/dist/style.css';
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { DEFAULT_DFT_DAG } from '@/features/computation/dag-defaults';
import { unitsToFlow } from '@/features/computation/dag-layout';
import { DftUnitNode } from '@/features/computation/components/dft-unit-node';

const nodeTypes = { dftUnit: DftUnitNode };

export function WorkflowDagEditor() {
  const initial = useMemo(() => unitsToFlow(DEFAULT_DFT_DAG), []);
  const [nodes, , onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  return (
    <div className='bg-muted/20 h-[480px] w-full rounded-lg border'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
