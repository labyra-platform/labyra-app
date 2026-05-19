/**
 * Deviation analysis result schema — mirrors worker src/deviation output.
 *
 * Worker writes to: tenants/{tid}/spectra/{sid}/analysis/latest
 *   analysisResult.deviationAnalysis = (this shape)
 *
 * @phase R185-10a
 */

import type { VerifiedCitation } from '@/types/material-profiles';

export type { VerifiedCitation };

export interface PeakMatch {
  sample_index: number;
  sample_position: number;
  sample_intensity: number;
  sample_fwhm: number;
  ref_index: number;
  ref_position: number;
  ref_intensity: number;
  ref_assignment: string;
  deviation: number;
  confidence: number;
}

export interface UnmatchedPeak {
  index: number;
  position: number;
  intensity: number;
  source: 'sample' | 'reference';
}

export interface MatchResult {
  spectrum_type: string;
  reference_formula: string;
  reference_label: string;
  tolerance_used: number;
  matches: PeakMatch[];
  unmatched_sample: UnmatchedPeak[];
  unmatched_ref: UnmatchedPeak[];
  match_count: number;
  match_rate: number;
  mean_abs_deviation: number;
  max_abs_deviation: number;
  rmse: number;
  quality_grade: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface Hypothesis {
  rule_id: string;
  name: string;
  confidence: number;
  evidence: string[];
  quantitative_estimate?: string | null;
  suggested_followup?: string | null;
  citation?: VerifiedCitation | null;
  severity?: 'info' | 'warning' | 'error';
}

export interface CrystallinitySizeEstimate {
  value_nm: number;
  uncertainty_nm: number;
  method: 'scherrer' | 'phonon-confinement' | 'qualitative';
  citation?: VerifiedCitation | null;
  notes: string;
}

export interface Crystallinity {
  classification: 'bulk' | 'nanocrystalline' | 'amorphous' | 'mixed' | 'unknown';
  confidence: number;
  signals: {
    fwhm_ratio: number | null;
    peak_count_ratio: number | null;
    background_ratio: number | null;
    mean_signed_shift: number | null;
    fwhm_cv: number | null;
  };
  size_estimate?: CrystallinitySizeEstimate | null;
  tolerance_factor: number;
  reasoning: string[];
}

export interface ComponentMatch {
  formula: string;
  role: string;
  weight_prior: number;
  nominal_fraction: number | null;
  reference_label: string;
  match_result: MatchResult;
  intended_peaks_observed: number;
  intended_peaks_total: number;
  intent_coverage: number;
}

export interface MultiPhaseResult {
  spectrum_type: string;
  components: ComponentMatch[];
  unassigned_peaks: Array<{
    sample_index: number;
    position: number;
    intensity: number;
    note: string;
  }>;
  intended_phases: string[];
  intended_but_not_observed: string[];
  overall_match_rate: number;
  overall_grade: string;
}

export interface FractionEstimate {
  formula: string;
  value: number;
  uncertainty: number;
  method:
    | 'rir'
    | 'direct-comparison'
    | 'lambert-beer'
    | 'raman-intensity-ratio-qualitative'
    | 'peak-count-fallback';
  quantitative: boolean;
  caveat: string;
  citation?: VerifiedCitation | null;
}

export interface RietveldPhase {
  formula: string;
  scale_factor: number;
  scale_uncertainty: number;
  mass_fraction: number;
  mass_uncertainty: number;
  cell_volume_A3?: number | null;
  formula_mass?: number | null;
  formula_units_per_cell?: number | null;
  crystallite_size_nm?: number | null;
  crystallite_size_uncertainty_nm?: number | null;
}

export interface RietveldResult {
  converged: boolean;
  n_iterations: number;
  r_wp?: number | null;
  chi_squared?: number | null;
  phases: RietveldPhase[];
  profile?: {
    U: number;
    V: number;
    W: number;
    eta: number;
    zero_shift: number;
  } | null;
  background?: {
    coefficients: number[];
  } | null;
  notes: string[];
}

export interface DeviationAnalysis {
  mode: 'single-phase' | 'multi-phase';
  // Single-phase fields
  matchResult?: MatchResult | null;
  hypotheses?: Hypothesis[];
  crystallinity?: Crystallinity | null;
  referenceFormula?: string | null;
  referenceLabel?: string | null;
  referenceSource?: string | null;
  referenceMpId?: string | null;
  // Multi-phase fields
  multiPhase?: MultiPhaseResult | null;
  perComponentHypotheses?: Record<string, Hypothesis[]>;
  compositeHypotheses?: Hypothesis[];
  fractionEstimates?: FractionEstimate[];
  rietveld?: RietveldResult | null;
}
