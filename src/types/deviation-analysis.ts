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
  /** R185-7c-3: per-phase Bragg R-factor (%) */
  r_bragg?: number | null;
}

export interface RietveldResult {
  converged: boolean;
  n_iterations: number;
  r_wp?: number | null;
  r_p?: number | null;
  r_exp?: number | null;
  gof?: number | null;
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
  /** R185-7c-3: difference plot data (downsampled ~200 pts) */
  difference_plot?: {
    x: number[];
    y_obs: number[];
    y_calc: number[];
    diff: number[];
  } | null;
  /** R185-7c-3: per-phase contribution arrays (downsampled) */
  phase_contributions?: Record<string, number[]> | null;
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

/* ============================================================
 * R185-10c: Cross-Spectrum Inference Engine (CSIE) result types
 * mirrors worker src/csie/types.py
 * ============================================================ */

export interface EvidenceItem {
  spectrum_id: string;
  spectrum_type: string;
  technique_strength: number;
  match_quality: string;
  intent_coverage: number;
  hypotheses_count: number;
  notable_findings: string[];
}

export type ConsistencyVerdict = 'confirmed' | 'partial' | 'missing' | 'conflict';

export interface PhaseEvidence {
  formula: string;
  role: string;
  declared_in_sample: boolean;
  spectra_supporting: EvidenceItem[];
  spectra_missing: string[];
  spectra_conflicting: string[];
  consistency_score: number;
  verdict: ConsistencyVerdict;
  reasoning: string[];
}

export interface CandidateCause {
  rule_id: string;
  name: string;
  confidence: number;
  score: number;
  evidence: string[];
  citation_doi?: string | null;
}

export interface DiscriminationExperiment {
  technique: string;
  measurement: string;
  discriminates_between: string[];
  expected_outcomes: Record<string, string>;
  citation_doi?: string | null;
}

export interface AmbiguousObservation {
  observation_id: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
  candidates: CandidateCause[];
  discrimination_experiments: DiscriminationExperiment[];
  notes: string[];
}

export interface ConsistencyCheck {
  sample_id_hash: string;
  tenant_id_hash: string;
  measurements_analyzed: number;
  spectrum_types_present: string[];
  declared_phases: PhaseEvidence[];
  unexpected_observations: string[];
  overall_coherence_score: number;
  conflicts_count: number;
  /** R185-9: injected by pipeline if ambiguous observations detected */
  ambiguous_observations?: AmbiguousObservation[];
}

export interface CSIEResult {
  schema_version: number;
  status: 'ok' | 'insufficient_data' | 'rate_limited' | 'failed';
  consistency: ConsistencyCheck | null;
  notes: string[];
  computed_at: string;
  idempotency_key: string;
}
