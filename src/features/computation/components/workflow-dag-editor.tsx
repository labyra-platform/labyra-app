/**
 * Workflow DAG editor — interactive node graph for composing a DFT workflow.
 *
 * Phase B2: add calc units (toolbar), connect (drag handle→handle), delete
 * (select + Backspace/Delete), reset to the default 7-unit DAG. Per-node config
 * (B3) and serialize→submit (B4) come next.
 *
 * @phase R242-dag-editor-b2
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
import type { Connection, Node } from '@xyflow/react';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CALC_TYPES, DEFAULT_DFT_DAG } from '@/features/computation/dag-defaults';
import { unitsToFlow } from '@/features/computation/dag-layout';
import { DftUnitNode } from '@/features/computation/components/dft-unit-node';

const nodeTypes = { dftUnit: DftUnitNode };
const DELETE_KEYS = ['Backspace', 'Delete'];

function calcTypeOf(node: Node): string {
  return String((node.data as { calcType?: unknown }).calcType ?? '');
}

export function WorkflowDagEditor() {
  const t = useTranslations('computation');
  const initial = useMemo(() => unitsToFlow(DEFAULT_DFT_DAG), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const addUnit = useCallback(
    (calcType: string) => {
      setNodes((nds) => {
        const same = nds.filter((n) => calcTypeOf(n) === calcType).length;
        const id = same === 0 ? calcType : `${calcType}-${same + 1}`;
        const node: Node = {
          id,
          type: 'dftUnit',
          position: { x: 32, y: 32 + nds.length * 24 },
          data: { id, calcType }
        };
        return [...nds, node];
      });
    },
    [setNodes]
  );

  const reset = useCallback(() => {
    const fresh = unitsToFlow(DEFAULT_DFT_DAG);
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
  }, [setNodes, setEdges]);

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='text-muted-foreground mr-1 text-xs'>{t('builderAddUnit')}</span>
        {CALC_TYPES.map((ct) => (
          <Button key={ct} size='sm' variant='outline' onClick={() => addUnit(ct)}>
            <IconPlus className='size-3' aria-hidden />
            {ct}
          </Button>
        ))}
        <Button size='sm' variant='ghost' className='ml-auto' onClick={reset}>
          <IconRefresh className='size-3' aria-hidden />
          {t('builderReset')}
        </Button>
      </div>

      <div className='bg-muted/20 h-[480px] w-full rounded-lg border'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          deleteKeyCode={DELETE_KEYS}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <p className='text-muted-foreground text-xs'>{t('builderHint')}</p>
    </div>
  );
}
