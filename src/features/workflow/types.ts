/**
 * Domain types for the shared WorkflowGraph engine (ADR-049). Reused by Protocol
 * and DFT/Computation screens. Manuscript is linear and does NOT use this.
 */
import type { Edge, Node } from '@xyflow/react';

/**
 * AiiDA-style node taxonomy (principle only — no AiiDA runtime): a node is
 * either a process (a calculation / experimental step that consumes inputs and
 * produces outputs) or a data node (a concrete artifact: a structure, a
 * measurement, a parameter set).
 */
export type WorkflowNodeKind = 'process' | 'data';

/** Execution / recording status of a node (DFT step, protocol step). */
export type WorkflowNodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/**
 * Data carried by every WorkflowGraph node. Extends `Record<string, unknown>`
 * so it satisfies React Flow's node-data constraint.
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  kind: WorkflowNodeKind;
  status?: WorkflowNodeStatus;
  /** Optional one-line detail under the label (e.g. "Quantum ESPRESSO · pw.x"). */
  subtitle?: string;
}

/** A WorkflowGraph node = a React Flow node specialised to our data. */
export type WfNode = Node<WorkflowNodeData>;

/** A WorkflowGraph edge (a data / control dependency in the DAG). */
export type WfEdge = Edge;
