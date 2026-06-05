/**
 * Layered left-to-right auto-layout (Sugiyama-lite) for the WorkflowGraph.
 *
 * Each node's column = the longest path from a source node (one with no incoming
 * edge); nodes in the same column stack into rows in input order. Pure and
 * dependency-free — handles linear chains, trees, and simple merging DAGs, which
 * covers the MVP (DFT pipelines, protocol steps). A richer engine
 * (`@dagrejs/dagre`) can replace this later per ADR-049 without changing callers.
 */
import type { WfEdge, WfNode } from '@/features/workflow/types';

export interface LayoutOptions {
  /** Horizontal gap between columns (px). */
  colGap?: number;
  /** Vertical gap between rows (px). */
  rowGap?: number;
}

export function layoutLayered(
  nodes: WfNode[],
  edges: WfEdge[],
  opts: LayoutOptions = {}
): WfNode[] {
  const colGap = opts.colGap ?? 260;
  const rowGap = opts.rowGap ?? 120;

  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    incoming.get(e.target)?.push(e.source);
  }

  // Longest-path layering via memoised DFS. Cycle-guarded (graph assumed acyclic).
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const computeDepth = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle → treat as a root
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map(computeDepth)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of ids) computeDepth(id);

  // Stable row assignment per column (preserves input order).
  const rowCount = new Map<number, number>();
  return nodes.map((n) => {
    const col = depth.get(n.id) ?? 0;
    const row = rowCount.get(col) ?? 0;
    rowCount.set(col, row + 1);
    return { ...n, position: { x: col * colGap, y: row * rowGap } };
  });
}
