/**
 * Samples types: prepared samples derived from materials.
 *
 * Extends ProvBase. `workflowStatus` is domain lifecycle (prepared/in_use/...);
 * `lifecycleStatus` from ProvBase is record state (active/deprecated/retracted).
 *
 * Document ID format: `sam_<slug>_<seq>` (e.g. `sam_wo3_batch_001`)
 *
 * @phase R164-phase-1-types (was R160-data-1)
 */

import type { ProvBase } from './prov-base';

// Domain workflow status (was `SampleStatus` — same enum, renamed for clarity
// vs ProvBase.lifecycleStatus which is record-level).
export type SampleWorkflowStatus = 'prepared' | 'in_use' | 'consumed' | 'archived' | 'discarded';

/**
 * @deprecated Use SampleWorkflowStatus. Type alias kept for backward compat
 * during R164 transition. Will be removed in R165.
 */
export type SampleStatus = SampleWorkflowStatus;

export interface Sample extends ProvBase {
  schemaVersion: 2;

  // Identity
  sampleCode: string;
  name: string;
  description?: string;

  // Lineage (existing fields; ProvBase.derivedFrom is the generic equivalent)
  // R164-phase-1: parentMaterialIds is the canonical Material → Sample link.
  // ProvBase.derivedFrom optionally repeats this for cross-entity queries.
  parentMaterialIds: string[];
  derivedFromSampleId?: string;

  // Preparation (preparedAt + preparedBy provide finer-grained activity
  // metadata than the generic ProvBase.createdAt/By)
  preparedAt: number;
  preparedBy: string;
  protocol?: string;

  // Properties
  mass?: number;
  volume?: number;
  concentration?: number;
  concentrationUnit?: string;

  // Workflow state (renamed from `status` to disambiguate from lifecycleStatus)
  workflowStatus: SampleWorkflowStatus;
  location?: string;
}
