/**
 * AnalysisResult types — mirror worker schema.
 * @phase R160-spectra-3c-hotfix
 */

import type {
  DSCAIOutput,
  DSCParsedData,
  OCPAIOutput,
  OCPParsedData,
  TGAAIOutput,
  TGAParsedData
} from '@/types/spectra-analysis-ext';
import type {
  CVParsedData,
  EISParsedData,
  LSVParsedData,
  PECJVParsedData,
  PECMottSchottkyParsedData,
  TafelParsedData
} from '@/types/spectra-analysis-echem';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type CitationSourceType = 'COD' | 'MP' | 'internal' | 'web' | 'unverified';

export interface PhaseSource {
  type: CitationSourceType;
  id: string | null;
  doi?: string | null;
}

// R161-citation-types: full citation candidate from worker.
// R164-phase-10-fix-types: added paperId for internal Reference → Paper link.
export interface CitationInfo {
  source: CitationSourceType;
  id: string;
  authors?: string | null;
  title?: string | null;
  journal?: string | null;
  year?: number | null;
  doi?: string | null;
  url?: string | null;
  paperId?: string | null;
}

export interface CitationCandidate {
  citation: CitationInfo;
  formula: string;
  space_group: string;
  space_group_number: number | null;
  crystal_system: string | null;
  lattice_a: number | null;
  lattice_b: number | null;
  lattice_c: number | null;
  lattice_alpha: number | null;
  lattice_beta: number | null;
  lattice_gamma: number | null;
  simulated_peaks: {
    twotheta: number;
    intensity: number;
    relative_intensity: number;
    multiplicity: number;
    hkl: number[];
  }[];
  match_score: number;
  matched_peaks_count: number;
  total_user_peaks: number;
  intensity_correlation: number | null;
  user_hkl_map: Record<string, number[]>;
}

export interface CitationLookupResult {
  query: string;
  candidates: CitationCandidate[];
  errors: string[];
}

export interface SpectrumCurve {
  x: number[];
  y: number[];
}

// =====================================================================
// XRD
// =====================================================================

export interface XRDPeak {
  two_theta: number;
  intensity: number;
  fwhm: number;
  relative_intensity: number;
  // Tier 1+2 enriched fields (R161-xrd-detail)
  integral_breadth?: number; // ° (Gaussian approx)
  prominence?: number;
  d_spacing?: number | null; // Å, from Bragg
  crystallite_size_nm?: number | null; // per-peak Scherrer D
  dislocation_density?: number | null; // lines/m² = 1/D²
  microstrain?: number | null; // per-peak β·cosθ/4
  hkl?: string; // Miller indices from citation match
}

export interface WilliamsonHallResult {
  crystallite_size_nm: number;
  microstrain: number;
  r_squared: number;
  method: 'Williamson-Hall';
  n_peaks_used: number;
  is_reliable?: boolean;
  quality_note?: string | null;
}

export interface XRDQualityMetrics {
  scan_range_2theta: [number, number];
  step_size_deg: number;
  data_points: number;
  n_peaks_detected: number;
  background_estimate?: number;
  noise_std?: number;
  snr?: number | null;
  max_intensity?: number;
  smallest_fwhm?: number;
  resolution_estimate?: number;
}

export interface XRDParsedData {
  spectrum_type: 'xrd';
  peaks: XRDPeak[];
  spectrum_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  scherrer_avg_nm: number | null;
  williamson_hall: WilliamsonHallResult | null;
  // Tier 1+2 (R161-xrd-detail)
  crystallinity_percent?: number | null;
  quality_metrics?: XRDQualityMetrics;
  wavelength_angstrom: number;
  source: string;
  // R161-citation
  citation?: CitationLookupResult;
}

export interface PhaseIdentification {
  name: string;
  confidence: ConfidenceLevel;
  matched_peaks: number;
  note: string;
  source?: PhaseSource | null;
}

export interface XRDAIOutput {
  summary: string;
  phases: PhaseIdentification[];
  crystallite_size_nm: number | null;
  microstrain: number | null;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// =====================================================================
// UV-Vis (transmission)
// =====================================================================

export interface UVVisPeak {
  wavelength_nm: number;
  absorbance: number;
  energy_ev: number;
}

export interface TaucBandgapResult {
  bandgap_ev: number;
  transition: 'direct' | 'indirect';
  r_squared: number;
  fit_range_ev: [number, number];
  slope?: number;
  intercept?: number;
  method: string;
}

export interface UVVisParsedData {
  spectrum_type: 'uvvis';
  peaks: UVVisPeak[];
  spectrum_curve: SpectrumCurve;
  tauc_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  tauc_bandgap: TaucBandgapResult | null;
  x_unit: 'nm';
  y_unit: 'Absorbance';
}

export interface UVVisAIOutput {
  summary: string;
  bandgap: {
    value_ev: number | null;
    transition: 'direct' | 'indirect' | null;
    confidence: ConfidenceLevel;
  };
  absorption_features: Array<{
    wavelength_nm: number;
    assignment: string;
    note: string;
  }>;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// =====================================================================
// UV-Vis DRS
// =====================================================================

export interface UVVisDRSParsedData {
  spectrum_type: 'uvvis_drs';
  peaks: [];
  reflectance_curve: SpectrumCurve;
  km_curve: SpectrumCurve;
  tauc_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  tauc_bandgap: TaucBandgapResult | null;
  reflectance_mode: 'percent' | 'fractional';
  x_unit: 'nm';
  y_unit: 'Reflectance';
}

export interface UVVisDRSAIOutput {
  summary: string;
  bandgap: {
    value_ev: number | null;
    transition: 'direct' | 'indirect' | null;
    confidence: ConfidenceLevel;
  };
  reflectance_profile: string;
  likely_sample_type: string | null;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// =====================================================================
// Raman
// =====================================================================

export interface RamanPeak {
  shift_cm1: number;
  intensity: number;
  fwhm: number;
  relative_intensity: number;
}

export interface CarbonAnalysis {
  d_band_cm1: number;
  g_band_cm1: number;
  id_ig_ratio: number;
  interpretation: string;
  '2d_band_cm1'?: number;
  i2d_ig_ratio?: number;
}

export interface RamanParsedData {
  spectrum_type: 'raman';
  peaks: RamanPeak[];
  spectrum_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  carbon_analysis: CarbonAnalysis | null;
  x_unit: 'cm-1';
  y_unit: string;
}

export interface RamanAIOutput {
  summary: string;
  vibrational_modes: Array<{
    shift_cm1: number;
    assignment: string;
    note: string;
  }>;
  likely_material: string | null;
  carbon_interpretation: string | null;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// =====================================================================
// FTIR
// =====================================================================

export interface FTIRPeak {
  wavenumber_cm1: number;
  absorbance: number;
  fwhm: number;
}

export interface FunctionalGroup {
  name: string;
  note: string;
  range_cm1: [number, number];
  matched_peaks_cm1: number[];
}

export interface FTIRParsedData {
  spectrum_type: 'ftir';
  peaks: FTIRPeak[];
  spectrum_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  y_mode: 'transmittance' | 'absorbance' | 'unknown';
  functional_groups: FunctionalGroup[];
  x_unit: 'cm-1';
  y_unit: string;
}

export interface FTIRAIOutput {
  summary: string;
  functional_groups: Array<{
    name: string;
    wavenumber_cm1: number;
    confidence: ConfidenceLevel;
    note: string;
  }>;
  likely_compound_class: string | null;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// =====================================================================
// Union
// =====================================================================

export type SpectrumParsedData =
  | XRDParsedData
  | UVVisParsedData
  | UVVisDRSParsedData
  | RamanParsedData
  | FTIRParsedData
  | TGAParsedData
  | DSCParsedData
  | OCPParsedData
  | TafelParsedData
  | LSVParsedData
  | CVParsedData
  | EISParsedData
  | PECJVParsedData
  | PECMottSchottkyParsedData;

export type SpectrumAIOutput =
  | XRDAIOutput
  | UVVisAIOutput
  | UVVisDRSAIOutput
  | RamanAIOutput
  | FTIRAIOutput
  | TGAAIOutput
  | DSCAIOutput
  | OCPAIOutput;

export interface AnalysisResult {
  schemaVersion: 1;
  analysisVersion: string;
  createdAt: number;
  locale: string;
  spectrumType: string;
  parsed: SpectrumParsedData;
  ai: SpectrumAIOutput;
  /** R185-10a-2: deviation analysis result from worker rules engine. */
  deviationAnalysis?: import('./deviation-analysis').DeviationAnalysis | null;
}

// ============================================================
// R163-spectra-4c-5a — Multi-spectrum citation candidates
// ============================================================
// Existing CitationCandidate above is XRD-specific (lattice/hkl/space_group).
// New variants for FTIR/Raman/UV-Vis carry only fields relevant to each.

export interface FTIRCitationCandidate {
  spectrumType: 'ftir';
  citation: CitationInfo;
  formula: string;
  reference_peaks: {
    wavenumber: number; // cm⁻¹
    intensity: number; // 0-100
    assignment: string | null; // e.g. "Si-O stretch"
  }[];
  match_score: number;
  matched_peaks_count: number;
  total_user_peaks: number;
  // Maps user peak index → ref peak assignment (for UI display)
  user_assignment_map: Record<string, string>;
}

export interface RamanCitationCandidate {
  spectrumType: 'raman';
  citation: CitationInfo;
  formula: string;
  laser_wavelength_nm: number | null;
  reference_peaks: {
    shift: number; // cm⁻¹
    intensity: number; // 0-100
    assignment: string | null; // e.g. "G-band"
  }[];
  match_score: number;
  matched_peaks_count: number;
  total_user_peaks: number;
  user_assignment_map: Record<string, string>;
}

export interface UVVisCitationCandidate {
  spectrumType: 'uvvis';
  citation: CitationInfo;
  formula: string;
  solvent: string | null;
  reference_peaks: {
    wavelength: number; // nm
    intensity: number; // 0-100 or normalized absorbance
    assignment: string | null; // e.g. "π-π* aromatic"
  }[];
  match_score: number;
  matched_peaks_count: number;
  total_user_peaks: number;
  user_assignment_map: Record<string, string>;
}

// Marker for legacy XRD candidate (no schema change — just typing).
// Code that wants discriminated narrowing should use (candidate as XRDCitationCandidate)
// when spectrumType === 'xrd', or directly use CitationCandidate.
export type XRDCitationCandidate = CitationCandidate & { spectrumType?: 'xrd' };

export type MultiCitationCandidate =
  | (CitationCandidate & { spectrumType: 'xrd' })
  | FTIRCitationCandidate
  | RamanCitationCandidate
  | UVVisCitationCandidate;
