/**
 * AnalysisResult types — mirror the worker output schema.
 * @phase R160-spectra-3c (extended for UV-Vis, Raman, FTIR)
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

// =====================================================================
// XRD (spectra-3a)
// =====================================================================

export interface XRDPeak {
  two_theta: number;
  intensity: number;
  fwhm: number;
  relative_intensity: number;
}

export interface WilliamsonHallResult {
  crystallite_size_nm: number;
  microstrain: number;
  r_squared: number;
  method: 'Williamson-Hall';
  n_peaks_used: number;
}

export interface XRDParsedData {
  spectrum_type: 'xrd';
  peaks: XRDPeak[];
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  scherrer_avg_nm: number | null;
  williamson_hall: WilliamsonHallResult | null;
  wavelength_angstrom: number;
  source: string;
}

export interface PhaseIdentification {
  name: string;
  confidence: ConfidenceLevel;
  matched_peaks: number;
  note: string;
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
// UV-Vis (spectra-3c)
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
  method: string;
}

export interface UVVisParsedData {
  spectrum_type: 'uvvis';
  peaks: UVVisPeak[];
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
// Raman (spectra-3c)
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
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  carbon_analysis: CarbonAnalysis | null;
  x_unit: 'cm⁻¹';
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
// FTIR (spectra-3c)
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
  quick_stats: {
    rowCount: number;
    xRange: [number, number];
    yRange: [number, number];
    peakCount: number;
  };
  y_mode: 'transmittance' | 'absorbance' | 'unknown';
  functional_groups: FunctionalGroup[];
  x_unit: 'cm⁻¹';
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
// Discriminated unions
// =====================================================================

export type SpectrumParsedData = XRDParsedData | UVVisParsedData | RamanParsedData | FTIRParsedData;
export type SpectrumAIOutput = XRDAIOutput | UVVisAIOutput | RamanAIOutput | FTIRAIOutput;

export interface AnalysisResult {
  schemaVersion: 1;
  analysisVersion: string;
  createdAt: number;
  locale: string;
  spectrumType: string;
  parsed: SpectrumParsedData;
  ai: SpectrumAIOutput;
}
