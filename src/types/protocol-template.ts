/**
 * Protocol Template (Quy trình mẫu) — a reusable, node-graph procedure that an
 * experiment's protocol-instance can later be derived from. Standalone and
 * shared at the lab (tenant) level: NOT linked to a project (templates are
 * reusable across projects, like Spectral Standards) and NOT tied to one
 * experiment.
 *
 * The graph (steps + edges) maps 1:1 onto the shared WorkflowGraph engine
 * (ADR-049): a step → a WorkflowGraph node, an edge → a dependency.
 *
 * Storage: tenants/{tenantId}/protocolTemplates/{id} (per-tenant, like projects).
 *
 * @phase R270 — Protocol Template (MVP data layer)
 * @see labyra-workflow-node-graph-strategy.md
 */
import { z } from 'zod';
import type { ProvBase } from './prov-base';

/** Aligns with WorkflowNodeKind: a process step vs a data artifact. */
export type ProtocolStepKind = 'process' | 'data';

/** A Blender-style on-node input (reagent, amount, parameter). */
export interface ProtocolInput {
  id: string;
  label: string;
  value?: string;
}

/** One step (node) in the protocol graph. */
export interface ProtocolStep {
  id: string;
  label: string;
  kind: ProtocolStepKind;
  /** Optional one-liner under the label (e.g. "stir · 30 min"). */
  subtitle?: string;
  inputs?: ProtocolInput[];
}

/** A dependency (edge) between two steps. */
export interface ProtocolEdge {
  id: string;
  source: string;
  target: string;
}

/** Workflow status (distinct from PROV-O lifecycleStatus). */
export type ProtocolTemplateStatus = 'active' | 'archived';

export interface ProtocolTemplate extends ProvBase {
  name: string;
  description?: string;
  steps: ProtocolStep[];
  edges: ProtocolEdge[];
  status: ProtocolTemplateStatus;
}

/**
 * Editable fields of a template (create/update form payload). The graph itself
 * (steps + edges) is saved separately via updateProtocolGraph from the editor.
 */
export const protocolTemplateInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional()
});

export type ProtocolTemplateInput = z.infer<typeof protocolTemplateInputSchema>;
