/**
 * Experiments types: lab runs, syntheses, characterizations.
 *
 * Extends ProvBase. Status fields:
 *   - workflowStatus: domain (planned/running/completed/failed/cancelled)
 *   - lifecycleStatus: record (active/deprecated/retracted) from ProvBase
 *
 * Document ID format: `exp_<slug>_<seq>` (e.g. `exp_synth_q1_001`)
 *
 * Note: Measurement entity (R164-phase-1) replaces the legacy concept of
 * "experiment results" with first-class activity records that have proper
 * sampleId/experimentId references.
 *
 * @phase R164-phase-1-types (was R160-data-1)
 */

import type { ProvBase } from './prov-base';

export type ExperimentType =
  | 'synthesis'
  | 'characterization'
  | 'measurement'
  | 'analysis'
  | 'other';

export type ExperimentWorkflowStatus = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * @deprecated Use ExperimentWorkflowStatus.
 */
export type ExperimentStatus = ExperimentWorkflowStatus;

export interface Experiment extends ProvBase {
  schemaVersion: 2;

  // Identity
  experimentCode: string;
  title: string;
  description?: string;
  hypothesis?: string; // R164: added per PROV-O scientific record

  // Type
  experimentType: ExperimentType;

  // Workflow state (renamed from `status`)
  workflowStatus: ExperimentWorkflowStatus;

  // Lineage
  sampleIds: string[];
  equipmentUsed?: string[];

  // Timing
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;

  // Results (will be progressively moved to Measurement + Analysis activities)
  results?: Record<string, unknown>;
  notes?: string;
  attachmentPaths?: string[];

  // Conditions
  temperature?: number;
  pressure?: number;
  duration?: number;
}
