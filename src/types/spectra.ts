/**
 * Spectrum types and metadata.
 * @phase R160-spectra-1
 * @see labyra-experiment-database-report.md Section 1 (Taxonomy: 6 groups × 24 types)
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
  chemicalFormula?: string;
  profileFunction?: string; // R161-phase-E: gaussian/lorentzian/pseudo_voigt
  zeroShift?: number; // R161-phase-E: 2θ offset correction (°) // user-provided for citation lookup (e.g. 'WO3')
  anode?: string; // X-ray anode for XRD: Cu/Mo/Co/Cr/Fe/Ag (default Cu)
  monochromator?: string; // XRD monochromator: none/ni_filter/graphite/ge111/johansson/si220

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

// ============================================================
// R160-spectra-4a-pdf: User-provided reference cards for XRD
// ============================================================
export interface ReferenceCardPeak {
  twoTheta: number; // 2θ in degrees
  dSpacing?: number; // optional, can be computed
  intensity: number; // relative intensity 0-100
  hkl?: string; // Miller indices like "002"
}

// ============================================================
// Reference cards — discriminated union by spectrumType
// R163-spectra-4c-1
// ============================================================

export type SpectrumTypeRefCard = 'xrd' | 'ftir' | 'raman' | 'uvvis';

// Common fields shared across all spectrum types.
// R164-phase-10-fix-types: added paperId — Reference.paperId can be migrated here for backward compat.
interface ReferenceCardBase {
  id: string;
  tenantId: string;
  cardNumber: string; // e.g. "PDF-2 33-1387", "FTIR-Smith-2020", "Custom-Raman-Si"
  phaseName: string; // e.g. "WO3 monoclinic", "Si-O stretching reference"
  formula?: string; // chemical formula if applicable
  source: 'manual' | 'cod' | 'mp' | 'paper';
  sourceUrl?: string;
  paperId?: string | null;
  notes?: string;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

// XRD peak (existing, unchanged structure)
export interface ReferenceCardPeak {
  twoTheta: number; // 2θ in degrees
  dSpacing?: number; // Å, optional (Bragg-derived)
  intensity: number; // relative intensity 0-100
  hkl?: string; // Miller indices like "002"
}

export interface XRDReferenceCard extends ReferenceCardBase {
  spectrumType: 'xrd';
  spaceGroup?: string;
  anode?: string; // e.g. 'Cu' (Kα wavelength used)
  peaks: ReferenceCardPeak[];
}

// FTIR peak: wavenumber (cm⁻¹), intensity, optional assignment
export interface FTIRReferenceCardPeak {
  wavenumber: number; // cm⁻¹, typical range 400-4000
  intensity: number; // relative 0-100
  assignment?: string; // e.g. "Si-O stretching", "C=O carbonyl"
}

export interface FTIRReferenceCard extends ReferenceCardBase {
  spectrumType: 'ftir';
  mode?: 'transmittance' | 'absorbance'; // measurement mode
  peaks: FTIRReferenceCardPeak[];
}

// Raman peak: shift (cm⁻¹) — same unit as FTIR but distinct semantics
export interface RamanReferenceCardPeak {
  shift: number; // cm⁻¹ Raman shift, typical 100-3500
  intensity: number; // relative 0-100
  assignment?: string; // e.g. "G-band", "D-band", "T2g mode"
}

export interface RamanReferenceCard extends ReferenceCardBase {
  spectrumType: 'raman';
  laserWavelength?: number; // nm, e.g. 532, 785, 1064
  peaks: RamanReferenceCardPeak[];
}

// UV-Vis peak: wavelength (nm), absorbance/intensity
export interface UVVisReferenceCardPeak {
  wavelength: number; // nm, typical 200-900
  intensity: number; // relative 0-100 or absorbance scaled
  assignment?: string; // e.g. "π-π* transition", "d-d band"
}

export interface UVVisReferenceCard extends ReferenceCardBase {
  spectrumType: 'uvvis';
  solvent?: string; // e.g. "ethanol", "water", "DMSO"
  peaks: UVVisReferenceCardPeak[];
}

// Discriminated union — use `card.spectrumType` to narrow.
export type ReferenceCard =
  | XRDReferenceCard
  | FTIRReferenceCard
  | RamanReferenceCard
  | UVVisReferenceCard;

// Helper: extract peak position regardless of spectrum type
export function getPeakPosition(
  peak: ReferenceCardPeak | FTIRReferenceCardPeak | RamanReferenceCardPeak | UVVisReferenceCardPeak
): number {
  if ('twoTheta' in peak) return peak.twoTheta;
  if ('wavenumber' in peak) return peak.wavenumber;
  if ('shift' in peak) return peak.shift;
  if ('wavelength' in peak) return peak.wavelength;
  return 0;
}

// Default match tolerance per spectrum type (in native units)
export const MATCH_TOLERANCE: Record<SpectrumTypeRefCard, number> = {
  xrd: 0.3, // degrees 2θ
  ftir: 4, // cm⁻¹
  raman: 2, // cm⁻¹ (higher resolution than FTIR)
  uvvis: 5 // nm
};
