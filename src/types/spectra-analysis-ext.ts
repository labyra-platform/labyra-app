/**
 * Extension types for TGA, DSC, OCP (spectra-3c-hotfix3).
 * Imported into main spectra-analysis.ts.
 * @phase R160-spectra-3c-hotfix3
 */

import type { ConfidenceLevel, SpectrumCurve } from '@/types/spectra-analysis';

// ============================================================
// TGA
// ============================================================

export interface TGADecompStage {
  onset_T: number;
  peak_T: number;
  end_T: number;
  mass_loss_pct: number;
  dtg_max: number;
}

export interface TGAParsedData {
  spectrum_type: 'tga';
  peaks: [];
  spectrum_curve: SpectrumCurve;
  dtg_curve: SpectrumCurve;
  decomp_stages: TGADecompStage[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  initial_mass_pct: number;
  final_mass_pct: number;
  total_loss_pct: number;
  temp_unit: 'C' | 'K';
  x_unit: string;
  y_unit: 'Mass (%)';
}

export interface TGAAIOutput {
  summary: string;
  stages_interpretation: Array<{
    stage: number;
    temp_range_C: [number, number];
    assignment: string;
    note: string;
  }>;
  estimated_composition: string;
  thermal_stability: string;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// ============================================================
// DSC
// ============================================================

export interface DSCPeak {
  peak_T: number;
  heat_flow: number;
  fwhm: number;
  direction: 'endothermic' | 'exothermic';
}

export interface DSCGlassTransition {
  tg: number;
  delta_cp_approx: number;
}

export interface DSCParsedData {
  spectrum_type: 'dsc';
  peaks: DSCPeak[];
  endothermic_peaks: DSCPeak[];
  exothermic_peaks: DSCPeak[];
  glass_transition: DSCGlassTransition | null;
  spectrum_curve: SpectrumCurve;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: 'deg-C';
  y_unit: string;
}

export interface DSCAIOutput {
  summary: string;
  thermal_events: Array<{
    type: 'Tg' | 'Tm' | 'Tc' | 'decomposition' | 'other';
    temp_C: number;
    direction: 'endo' | 'exo';
    assignment: string;
    note: string;
  }>;
  likely_material_class: string | null;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}

// ============================================================
// OCP
// ============================================================

export interface OCPEquilibrium {
  equilibrium_potential_V: number;
  std_dev_V: number;
  drift_mV_per_s: number;
  stability: 'stable' | 'drifting' | 'unstable';
  tail_duration_s: number;
}

export interface OCPParsedData {
  spectrum_type: 'ocp';
  peaks: [];
  spectrum_curve: SpectrumCurve;
  equilibrium: OCPEquilibrium;
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  duration_s: number;
  x_unit: 's';
  y_unit: string;
}

export interface OCPAIOutput {
  summary: string;
  equilibrium_potential_V: number;
  stability_assessment: string;
  physical_meaning: string;
  warnings: string[];
  next_steps: string[];
  overall_confidence: ConfidenceLevel;
}
