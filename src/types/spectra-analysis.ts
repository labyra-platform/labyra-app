/**
 * AnalysisResult types — mirror the worker output schema.
 * @phase R160-spectra-3b
 * @see labyra-spectra-worker/src/main.py:_process
 */

export type ConfidenceLevel = 'low' | 'medium' | 'high';

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
  name: string; // English (e.g., "WO3 monoclinic")
  confidence: ConfidenceLevel;
  matched_peaks: number;
  note: string; // localized
}

export interface AIAnalysisOutput {
  summary: string; // localized
  phases: PhaseIdentification[];
  crystallite_size_nm: number | null;
  microstrain: number | null;
  warnings: string[]; // localized
  next_steps: string[]; // localized
  overall_confidence: ConfidenceLevel;
  _meta?: {
    model: string;
    tokens_in: number;
    tokens_out: number;
    locale_used: string;
  };
}

export interface AnalysisResult {
  schemaVersion: 1;
  analysisVersion: string;
  createdAt: number;
  locale: string;
  spectrumType: string;
  parsed: XRDParsedData; // discriminate by spectrumType in future
  ai: AIAnalysisOutput;
}
