/**
 * PROV-O base types for all entities + activities.
 *
 * Reference: W3C PROV-O https://www.w3.org/TR/prov-o/
 * Implementation: ADR-016 PROV-O ELN Architecture
 *
 * @phase R164-phase-1-types
 */

/**
 * Lifecycle status (PROV-O retraction semantics).
 *
 * - active: normal record, visible by default
 * - deprecated: superseded by newer record, hidden by default but referenced
 * - retracted: scientifically invalid (e.g. fraud), hidden, audit trail only
 *
 * Different from workflow status (e.g. SampleStatus, ExperimentStatus) which
 * captures domain-specific state transitions.
 */
export type LifecycleStatus = 'active' | 'deprecated' | 'retracted';

/**
 * Base fields required on all PROV-O entities + activities.
 *
 * Entities (Material/Sample/Experiment/Paper/Reference) — slow-changing identity
 * Activities (Measurement/Analysis) — event-stream with timestamp + actor
 */
export interface ProvBase {
  // Identity
  id: string;
  tenantId: string;
  schemaVersion: number;

  // PROV-O Agent (who) — Firebase Auth UIDs
  createdBy: string; // wasAttributedTo
  createdAt: number;
  updatedBy?: string; // last editor
  updatedAt?: number;

  // PROV-O Provenance (derivation chain)
  derivedFrom?: string[]; // wasDerivedFrom (entity IDs in same tenant)
  generatedBy?: string; // wasGeneratedBy (activity ID — measurement/analysis)

  // Lifecycle (PROV-O retraction)
  lifecycleStatus: LifecycleStatus;
  retractedAt?: number;
  retractedBy?: string;
  retractedReason?: string;
}

/**
 * Standard query filter applied by default in service.list() to hide
 * deprecated + retracted records. Admin views opt-in with explicit filter.
 */
export const DEFAULT_LIFECYCLE_FILTER: LifecycleStatus[] = ['active'];
