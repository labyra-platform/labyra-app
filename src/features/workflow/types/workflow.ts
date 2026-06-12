/**
 * Shared workflow-graph primitives — the domain-agnostic contract for the
 * `<WorkflowGraph>` shell. Protocol and DFT graphs share these; only the node
 * renderer differs ("chung khung, riêng node").
 *
 * @phase R248-workflow-shell
 */

export type WorkflowDomain = 'protocol' | 'dft';

/** A directed dependency edge. The graph must stay acyclic (validate-dag). */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * A node handed to `<WorkflowGraph>`. `data` is domain-specific — the matching
 * renderer narrows it (DFT renderer reads order/name/calcType/status).
 */
export interface WorkflowNodeInput {
  id: string;
  data: Record<string, unknown>;
}
