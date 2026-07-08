/**
 * Protocol Instance — one experiment's run of a protocol, cloned (snapshotted)
 * from a ProtocolTemplate at attach time. It does NOT track later template edits:
 * a run that happened is history (immutable base), mirroring the PROV-O lifecycle.
 * The member overrides reagent/parameter values for their batch and records
 * per-step execution state; a "measure" step can later link real measurements.
 *
 * Storage: tenants/{tid}/experiments/{eid}/protocol/main (one per experiment).
 *
 * @phase R271 — Protocol Instance (data layer)
 * @see labyra-workflow-node-graph-strategy.md
 */
import { z } from 'zod';

import type { ProvBase } from './prov-base';
import type { ProtocolEdge, ProtocolInput, ProtocolStepKind } from './protocol-template';

/** Per-step execution state (distinct from PROV-O lifecycleStatus). */
export type ProtocolStepStatus = 'planned' | 'running' | 'done' | 'error';

export const PROTOCOL_STEP_STATUSES: ProtocolStepStatus[] = ['planned', 'running', 'done', 'error'];

/** A cloned step in a running protocol instance. */
export interface ProtocolInstanceStep {
  id: string;
  label: string;
  kind: ProtocolStepKind;
  subtitle?: string;
  /** Actual, overridable reagent/parameter values for THIS run. */
  inputs: ProtocolInput[];
  status: ProtocolStepStatus;
  /** Measurements produced at this step (PROV-O link — R273). */
  measurementIds?: string[];
  /** Free-text note recorded while running. */
  note?: string;
}

export interface ProtocolInstance extends ProvBase {
  experimentId: string;
  /** Source template (snapshot — not a live reference). */
  templateId: string;
  /** Template name at clone time, kept for display. */
  templateName: string;
  steps: ProtocolInstanceStep[];
  edges: ProtocolEdge[];
}

export const protocolInputSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().optional()
});

export const protocolInstanceStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['process', 'data']),
  subtitle: z.string().optional(),
  inputs: z.array(protocolInputSchema),
  status: z.enum(['planned', 'running', 'done', 'error']),
  measurementIds: z.array(z.string()).optional(),
  note: z.string().optional()
});
