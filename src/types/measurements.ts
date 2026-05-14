/**
 * Measurement: activity record for spectrum acquisition events.
 *
 * Replaces legacy `spectra` collection concept. A Measurement is the event
 * (scan timestamp, instrument used, parameters) — separate from the data
 * file (DataAsset) and the analysis result (Analysis entity).
 *
 * Document ID format: random UUID (high-volume activity, machine-generated)
 *
 * Lineage:
 *   Sample ──> Measurement (sampleId, optional experimentId)
 *   Measurement ──> Analysis (analysis.measurementId)
 *
 * @phase R164-phase-1-types
 */

import type { ProvBase } from './prov-base';
import type { SpectrumType } from './spectra';

export type MeasurementProcessingStatus =
  | 'uploaded'
  | 'queued'
  | 'parsing'
  | 'analyzing'
  | 'analyzed'
  | 'failed';

export interface Measurement extends ProvBase {
  schemaVersion: 1;

  // Identity & lineage
  sampleId?: string; // optional — measurement on bare material is possible
  experimentId?: string; // optional — ad-hoc measurements without experiment

  // Spectrum metadata
  spectrumType: SpectrumType;
  formula?: string; // user-provided sample formula for citation lookup
  measuredAt?: number; // when the scan was performed (vs uploadedAt)

  // File storage (immutable raw blob)
  fileAssetPath: string; // GCS path: gs://.../tenants/{tid}/measurements/{id}/raw/{filename}
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string; // computed after upload completes

  // Instrument parameters
  instrument?: string; // e.g. "PANalytical X'Pert Pro", "Bruker D8"
  parameters?: Record<string, unknown>; // anode, monochromator, step size, etc.

  // Processing state (worker pipeline)
  processingStatus: MeasurementProcessingStatus;
  processingStatusAt?: number;
  processingError?: string;

  // Reference back to analysis (set when analysis is created)
  analysisId?: string;
}
