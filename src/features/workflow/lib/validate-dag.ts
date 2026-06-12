/**
 * DAG validation — workflows must be acyclic (provenance principle, report 2.1).
 *
 * @phase R248-workflow-shell
 */
import type { WorkflowEdge } from '@/features/workflow/types/workflow';

function buildAdjacency(edges: WorkflowEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const out = adj.get(e.source) ?? [];
    out.push(e.target);
    adj.set(e.source, out);
  }
  return adj;
}

/** True if the edge set forms a DAG (no cycle). DFS three-colour. */
export function isAcyclic(nodeIds: string[], edges: WorkflowEdge[]): boolean {
  const adj = buildAdjacency(edges);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>(nodeIds.map((id) => [id, WHITE]));

  function visit(u: string): boolean {
    colour.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = colour.get(v) ?? WHITE;
      if (c === GRAY) return false;
      if (c === WHITE && !visit(v)) return false;
    }
    colour.set(u, BLACK);
    return true;
  }

  for (const id of nodeIds) {
    if ((colour.get(id) ?? WHITE) === WHITE && !visit(id)) return false;
  }
  return true;
}

/** True if adding source->target would create a cycle (target already reaches source). */
export function wouldCreateCycle(edges: WorkflowEdge[], source: string, target: string): boolean {
  if (source === target) return true;
  const adj = buildAdjacency(edges);
  const stack: string[] = [target];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const u = stack.pop() as string;
    if (u === source) return true;
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of adj.get(u) ?? []) stack.push(v);
  }
  return false;
}
