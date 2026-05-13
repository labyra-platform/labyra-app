/**
 * Experiments types: lab runs, measurements, syntheses.
 * @phase R160-data-1
 */

export type ExperimentType =
  | 'synthesis'
  | 'characterization'
  | 'measurement'
  | 'analysis'
  | 'other';

export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Experiment {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  // Identity
  experimentCode: string; // e.g. "E-2026-001", "HT-001", "EC-005"
  title: string;
  description?: string;

  // Type + status
  experimentType: ExperimentType;
  status: ExperimentStatus;

  // Lineage
  sampleIds: string[];
  equipmentUsed?: string[];

  // Timing
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;

  // Results
  results?: Record<string, unknown>; // flexible JSON
  notes?: string;
  attachmentPaths?: string[];

  // Conditions
  temperature?: number; // °C
  pressure?: number;
  duration?: number; // minutes

  // Audit
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
