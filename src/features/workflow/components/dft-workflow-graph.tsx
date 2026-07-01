/**
 * DFT read-path graph — renders a DftWorkflow's units as an LR pipeline DAG via
 * the shared <WorkflowGraph> shell. Edges from `dependsOn`; per-unit status from
 * `snapshot[unitId]`; a short read-only param preview per node. `selectedId`
 * highlights the active node.
 *
 * @phase R252-dft-workspace-shell
 */
'use client';

import { useMemo } from 'react';
import { WorkflowGraph } from '@/features/workflow/components/workflow-graph';
import type { WorkflowEdge, WorkflowNodeInput } from '@/features/workflow/types/workflow';
import type { DftUnit, DftWorkflow } from '@/types/dft';

const EXECUTABLE: Record<string, string> = {
  'vc-relax': 'pw.x',
  relax: 'pw.x',
  scf: 'pw.x',
  nscf: 'pw.x',
  bands: 'pw.x',
  ppbands: 'bands.x',
  dos: 'dos.x',
  pdos: 'projwfc.x',
  charge: 'pp.x'
};

function unitPreview(u: DftUnit, ecutwfc?: number): string {
  const exe = u.executable ?? EXECUTABLE[u.calcType] ?? 'pw.x';
  const parts: string[] = [exe];
  if (exe === 'pw.x') {
    if (ecutwfc != null) parts.push(`${ecutwfc} Ry`);
    const grid = u.params?.kPoints?.grid;
    if (grid) parts.push(`${grid[0]}×${grid[1]}×${grid[2]}`);
  }
  return parts.join(' · ');
}

interface DftWorkflowGraphProps {
  workflow: DftWorkflow;
  onNodeClick?: (id: string) => void;
  selectedId?: string | null;
  /** Tailwind classes for the canvas wrapper (appended; default h-[460px]). */
  className?: string;
}

export function DftWorkflowGraph({
  workflow,
  onNodeClick,
  selectedId,
  className
}: DftWorkflowGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const units = workflow.units ?? [];
    const ecutwfc = workflow.global?.ecutwfc;
    const graphNodes: WorkflowNodeInput[] = units.map((u, i) => ({
      id: u.id,
      data: {
        order: u.order ?? i + 1,
        name: u.name ?? u.calcType,
        calcType: u.calcType,
        status: workflow.snapshot?.[u.id]?.status,
        preview: unitPreview(u, ecutwfc)
      }
    }));
    const graphEdges: WorkflowEdge[] = units.flatMap((u) =>
      (u.dependsOn ?? []).map((src) => ({
        id: `${src}->${u.id}`,
        source: src,
        target: u.id
      }))
    );
    return { nodes: graphNodes, edges: graphEdges };
  }, [workflow]);

  if (nodes.length === 0) return null;

  return (
    <div className={`bg-muted/20 w-full rounded-lg border ${className ?? 'h-[460px]'}`}>
      <WorkflowGraph
        domain='dft'
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        selectedId={selectedId}
        showMiniMap={false}
      />
    </div>
  );
}
