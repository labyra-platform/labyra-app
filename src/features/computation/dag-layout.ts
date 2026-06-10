/**
 * DAG layout — converts a list of calc units (id + dependsOn) into a layered
 * left-to-right node/edge set for React Flow. Layer = longest path from roots,
 * so branches (nscf/bands) and leaves (dos/pdos/ppbands) line up cleanly.
 *
 * Pure + generic (works for any workflow shape, not just the 7-unit default).
 *
 * @phase R241-dag-editor
 */
import type { Edge, Node } from '@xyflow/react';

export interface DagUnit {
  id: string;
  calcType: string;
  dependsOn: string[];
}

const COL_W = 210;
const ROW_H = 96;

export function computeLayers(units: DagUnit[]): Map<string, number> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const layer = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // guard against accidental cycles
    visiting.add(id);
    const deps = byId.get(id)?.dependsOn ?? [];
    const value = deps.length === 0 ? 0 : Math.max(...deps.map(visit)) + 1;
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };

  units.forEach((u) => visit(u.id));
  return layer;
}

export function unitsToFlow(units: DagUnit[]): { nodes: Node[]; edges: Edge[] } {
  const layer = computeLayers(units);
  const perLayer = new Map<number, number>();

  const nodes: Node[] = units.map((u) => {
    const col = layer.get(u.id) ?? 0;
    const row = perLayer.get(col) ?? 0;
    perLayer.set(col, row + 1);
    return {
      id: u.id,
      type: 'dftUnit',
      position: { x: col * COL_W + 16, y: row * ROW_H + 16 },
      data: { id: u.id, calcType: u.calcType }
    };
  });

  const edges: Edge[] = units.flatMap((u) =>
    u.dependsOn.map((dep) => ({
      id: `${dep}->${u.id}`,
      source: dep,
      target: u.id
    }))
  );

  return { nodes, edges };
}
