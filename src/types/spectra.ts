/**
 * Spectrum types and metadata.
 * @phase R160-spectra-1
 * @see labrya-experiment-database-report.md Section 1 (Taxonomy: 6 groups × 24 types)
 */

export type SpectrumType =
  // Structural (3)
  | 'xrd'
  | 'saed'
  | 'hrtem'
  // Optical (4)
  | 'uvvis'
  | 'uvvis_drs'
  | 'ocp'
  | 'dsc'
  | 'tga'
  | 'pl'
  | 'raman'
  | 'ftir'
  // Electrochemistry (5)
  | 'cv'
  | 'eis'
  | 'gcd'
  | 'lsv'
  | 'ca'
  // Photoelectrochemistry (3)
  | 'pec_jv'
  | 'ipce'
  | 'eis_light'
  // Surface (4)
  | 'xps'
  | 'eds'
  | 'bet'
  | 'contact_angle'
  // Microscopy (5)
  | 'sem'
  | 'tem'
  | 'afm'
  | 'optical_microscopy';

export type SpectrumGroup =
  | 'structural'
  | 'optical'
  | 'electrochemistry'
  | 'photoelectrochemistry'
  | 'thermal'
  | 'surface'
  | 'microscopy';

export type SpectrumStatus =
  | 'uploaded' // file in Storage, metadata in Firestore
  | 'queued' // worker will pick up
  | 'processing' // worker is parsing
  | 'analyzed' // results available
  | 'failed';

export interface SpectrumStorage {
  raw: string; // gs://bucket/tenants/.../raw/<filename>
  processed?: string;
  thumbnail?: string; // for image types (SEM/TEM/AFM/optical)
}

export interface SpectrumQuickStats {
  rowCount?: number;
  xRange?: [number, number];
  yRange?: [number, number];
  peakCount?: number;
}

export interface SpectrumMetadata {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  // Lineage
  experimentId: string;
  sampleId: string;
  sampleLabel?: string; // denormalized
  chemicalFormula?: string; // user-provided for citation lookup (e.g. 'WO3')

  // Type
  spectrumType: SpectrumType;
  group: SpectrumGroup;

  // Storage
  storage: SpectrumStorage;

  // File metadata
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;

  // Measurement conditions
  instrument?: string;
  operator: string; // uid
  measuredAt: number; // epoch ms

  // Processing
  status: SpectrumStatus;
  analyzedAt?: number;
  analysisVersion?: string;
  errorMessage?: string;

  // Quick stats (for list display without loading data)
  quickStats?: SpectrumQuickStats;

  // Audit
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
