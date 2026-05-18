/**
 * Per-spectrum-type peak matching wrappers around matchScoreGeneric().
 *
 * Each function accepts user-detected peaks (worker output shape) and
 * reference card peaks (Firestore shape), returns weighted match score.
 *
 * Tolerances per type:
 *   XRD:    0.3°    (instrument peak width)
 *   FTIR:   4 cm⁻¹  (typical FTIR resolution 4 cm⁻¹)
 *   Raman:  2 cm⁻¹  (higher resolution 1-2 cm⁻¹)
 *   UV-Vis: 5 nm    (broader peaks, instrument variation)
 *
 * @phase R163-spectra-4c-5a
 */
import { type MatchScoreGenericResult, matchScoreGeneric } from '@/lib/spectra/match-score';
import type {
  FTIRReferenceCardPeak,
  RamanReferenceCardPeak,
  ReferenceCardPeak,
  UVVisReferenceCardPeak
} from '@/types/spectra';
import { MATCH_TOLERANCE } from '@/types/spectra';
import type { FTIRPeak, RamanPeak, UVVisPeak, XRDPeak } from '@/types/spectra-analysis';

export type { MatchScoreGenericResult };

export function matchScoreXRD(
  userPeaks: XRDPeak[],
  refPeaks: ReferenceCardPeak[],
  tolerance: number = MATCH_TOLERANCE.xrd
): MatchScoreGenericResult {
  return matchScoreGeneric(userPeaks, refPeaks, {
    userPosition: (p) => p.two_theta,
    refPosition: (p) => p.twoTheta,
    tolerance
  });
}

export function matchScoreFTIR(
  userPeaks: FTIRPeak[],
  refPeaks: FTIRReferenceCardPeak[],
  tolerance: number = MATCH_TOLERANCE.ftir
): MatchScoreGenericResult {
  return matchScoreGeneric(userPeaks, refPeaks, {
    userPosition: (p) => p.wavenumber_cm1,
    refPosition: (p) => p.wavenumber,
    tolerance
  });
}

export function matchScoreRaman(
  userPeaks: RamanPeak[],
  refPeaks: RamanReferenceCardPeak[],
  tolerance: number = MATCH_TOLERANCE.raman
): MatchScoreGenericResult {
  return matchScoreGeneric(userPeaks, refPeaks, {
    userPosition: (p) => p.shift_cm1,
    refPosition: (p) => p.shift,
    tolerance
  });
}

export function matchScoreUVVis(
  userPeaks: UVVisPeak[],
  refPeaks: UVVisReferenceCardPeak[],
  tolerance: number = MATCH_TOLERANCE.uvvis
): MatchScoreGenericResult {
  return matchScoreGeneric(userPeaks, refPeaks, {
    userPosition: (p) => p.wavelength_nm,
    refPosition: (p) => p.wavelength,
    tolerance
  });
}
