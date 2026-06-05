'use client';

/**
 * Throwaway smoke-test route for the WorkflowGraph engine (ADR-049). Renders a
 * sample DFT pipeline (branching DAG) to verify rendering + layered layout. Not
 * in the nav — visit /<locale>/dashboard/workflow-demo. Will be replaced by the
 * real Protocol / DFT screens.
 */
import { layoutLayered } from '@/features/workflow/layout';
import type { WfEdge, WfNode } from '@/features/workflow/types';
import { WorkflowGraph } from '@/features/workflow/workflow-graph';

const rawNodes: WfNode[] = [
  {
    id: 'struct',
    position: { x: 0, y: 0 },
    data: { label: 'm-WO₃ (P2₁/n)', kind: 'data', subtitle: '256 atoms · CIF' }
  },
  {
    id: 'relax',
    position: { x: 0, y: 0 },
    data: { label: 'vc-relax', kind: 'process', status: 'done', subtitle: 'pw.x · QE 7.4.1' }
  },
  {
    id: 'scf',
    position: { x: 0, y: 0 },
    data: { label: 'scf', kind: 'process', status: 'done', subtitle: 'pw.x' }
  },
  {
    id: 'nscf',
    position: { x: 0, y: 0 },
    data: { label: 'nscf', kind: 'process', status: 'running', subtitle: 'pw.x · dense k-grid' }
  },
  {
    id: 'bands',
    position: { x: 0, y: 0 },
    data: { label: 'bands', kind: 'process', status: 'pending', subtitle: 'bands.x' }
  },
  {
    id: 'dos',
    position: { x: 0, y: 0 },
    data: { label: 'DOS + gap', kind: 'data', status: 'pending' }
  }
];

const edges: WfEdge[] = [
  { id: 'e1', source: 'struct', target: 'relax' },
  { id: 'e2', source: 'relax', target: 'scf' },
  { id: 'e3', source: 'scf', target: 'nscf' },
  { id: 'e4', source: 'nscf', target: 'bands' },
  { id: 'e5', source: 'nscf', target: 'dos' }
];

export default function WorkflowDemoPage() {
  const nodes = layoutLayered(rawNodes, edges);
  return (
    <div className='p-6'>
      <h1 className='mb-1 text-lg font-semibold'>WorkflowGraph — DFT pipeline demo</h1>
      <p className='mb-4 text-sm text-muted-foreground'>
        ADR-049 engine smoke test. Process nodes are solid; data nodes are dashed. Status sets the
        ring colour.
      </p>
      <WorkflowGraph nodes={nodes} edges={edges} />
    </div>
  );
}
