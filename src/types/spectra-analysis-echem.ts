/**
 * Electrochemistry parsed-result types: Tafel, LSV, CV, EIS.
 * Mirrors the Python worker parser outputs (src/parsers/{tafel,lsv,cv,eis}.py).
 * Imported into the main SpectrumParsedData union.
 * @phase R212 (electrochemistry app support)
 */

import type { SpectrumCurve } from '@/types/spectra-analysis';

// ============================================================
// Tafel — HER/OER kinetics from log(j) vs overpotential
// ============================================================

export interface TafelAnalysis {
  tafel_slope_mV_per_dec: number;
  exchange_current_density_j0: number | null;
  j0_unit: string;
  r_squared: number;
  log_j_window: [number, number];
  mechanism_hint: string;
}

export interface TafelParsedData {
  spectrum_type: 'tafel';
  peaks: [];
  spectrum_curve: SpectrumCurve; // E (V) vs j (raw polarization)
  tafel_curve: SpectrumCurve | null; // log10|j| vs overpotential (proper Tafel axes)
  analysis: TafelAnalysis;
  quick_stats: {
    rowCount: number;
    eRange_V: [number, number];
    current_unit: string;
  };
  notes: string[];
}

// ============================================================
// LSV — linear sweep voltammetry (activity benchmark)
// ============================================================

export interface LSVAnalysis {
  current_density_unit: string;
  reaction?: string;
  overpotential_at_10mA_cm2_V?: number | null;
  onset_overpotential_at_1mA_cm2_V?: number | null;
  tafel?: { tafel_slope_mV_per_dec: number } | null;
}

export interface LSVParsedData {
  spectrum_type: 'lsv';
  peaks: [];
  spectrum_curve: SpectrumCurve; // E (V) vs I
  rhe_curve: SpectrumCurve | null; // E_rhe vs j (if reference+pH known)
  tafel_curve: SpectrumCurve | null; // log10|j| vs eta (Tafel view from this LSV)
  analysis: LSVAnalysis;
  conditions: {
    area_cm2: number | null;
    reference: string | null;
    pH: number | null;
    reaction: string | null;
    ir_corrected: boolean;
  };
  notes: string[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: string;
  y_unit: string;
}

// ============================================================
// CV — cyclic voltammetry (redox, reversibility)
// ============================================================

export interface CVAnalysis {
  Epa_V?: number;
  ipa?: number;
  Epc_V?: number;
  ipc?: number;
  dEp_mV?: number;
  E0_prime_V?: number;
  dEp_ideal_mV?: number;
  peak_current_ratio?: number;
  reversibility: string;
}

export interface CVParsedData {
  spectrum_type: 'cv';
  peaks: [];
  spectrum_curve: SpectrumCurve; // E (V) vs I
  analysis: CVAnalysis;
  conditions: {
    n_electrons: number;
    scan_rate_v_s: number | null;
    area_cm2: number | null;
  };
  notes: string[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: string;
  y_unit: string;
}

// ============================================================
// EIS — electrochemical impedance spectroscopy (Nyquist)
// ============================================================

export interface EISNyquist {
  z_real: number[];
  z_imag_neg: number[]; // -Z'' (already negated by worker)
}

export interface EISCircuitFit {
  circuit: string;
  parameters?: Record<string, number>;
  chi_square?: number;
  error?: string;
}

export interface EISParsedData {
  spectrum_type: 'eis';
  peaks: [];
  nyquist: EISNyquist;
  bode_curve: SpectrumCurve; // f (Hz) vs |Z|
  model_free: Record<string, unknown>;
  circuit_fit: EISCircuitFit;
  conditions: {
    area_cm2: number | null;
    n_electrons: number;
    temperature_K: number;
  };
  notes: string[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: string;
  y_unit: string;
}

// ============================================================
// PEC J-V — photoelectrochemistry linear sweep under illumination
// ============================================================

export interface PECJVAnalysis {
  current_density_unit: string;
  photocurrent_onset_V?: number;
  photocurrent_at_1p23V_RHE?: number;
  sth_percent?: number;
  abpe_percent?: number;
}

export interface PECJVParsedData {
  spectrum_type: 'pec_jv';
  peaks: [];
  spectrum_curve: SpectrumCurve; // E (V) vs j (net/measured photocurrent)
  light_dark_curve: { light: SpectrumCurve; dark: SpectrumCurve } | null;
  analysis: PECJVAnalysis;
  conditions: {
    area_cm2: number | null;
    light_power_mw_cm2: number;
    applied_bias_v: number | null;
  };
  notes: string[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: string;
  y_unit: string;
}

// ============================================================
// PEC Mott-Schottky — semiconductor flat-band, carrier density, type
// ============================================================

export interface PECMottSchottkyAnalysis {
  carrier_type: string; // 'n-type' | 'p-type'
  flat_band_V_vs_ref: number;
  flat_band_V_vs_rhe?: number;
  x_intercept_V: number;
  slope_cm4_F2_V: number;
  fit_r2: number;
  fit_range_V: [number, number];
  fit_range_idx: [number, number];
  fit_n_points: number;
  donor_density_cm3?: number;
  acceptor_density_cm3?: number;
  depletion_width_nm?: number | null;
}

export interface PECMottSchottkyParsedData {
  spectrum_type: 'pec_mott_schottky';
  peaks: [];
  spectrum_curve: SpectrumCurve; // E (V) vs 1/C² (downsampled, for display)
  mott_schottky_curve: SpectrumCurve; // full-resolution E vs 1/C² for client range fit
  analysis: PECMottSchottkyAnalysis;
  conditions: {
    eps_r: number | null;
    reference: string | null;
    pH: number | null;
    area_cm2: number | null;
    temperature_k: number;
  };
  notes: string[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  x_unit: string;
  y_unit: string;
}

export type EchemParsedData =
  | TafelParsedData
  | LSVParsedData
  | CVParsedData
  | EISParsedData
  | PECJVParsedData
  | PECMottSchottkyParsedData;
