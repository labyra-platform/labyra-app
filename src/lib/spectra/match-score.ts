/**
 * Pure peak-matching algorithm — no Firebase/Node imports.
 *
 * Extracted from src/lib/firebase/reference-cards/service.ts so that
 * client components can import the algorithm without dragging firebase-admin
 * into the browser bundle.
 *
 * Algorithm: for each reference peak, find the closest user peak within
 * tolerance. Weight contributions by reference peak intensity (0-100).
 * Returns score 0-1 (1 = perfect overlap, intensity-weighted).
 *
 * @phase R162-4b-client-server-fix
 */

import type { ReferenceCardPeak } from '@/types/spectra';

export interface MatchScoreResult {
  score: number;
  matchedCount: number;
  totalRef: number;
  details: { ref2t: number; userIdx: number | null; matched: boolean }[];
}

export function matchScore(
  userPeaks: { twoTheta: number; intensity?: number }[],
  refPeaks: ReferenceCardPeak[],
  toleranceDeg = 0.3
): MatchScoreResult {
  const details: { ref2t: number; userIdx: number | null; matched: boolean }[] = [];
  let weightedMatched = 0;
  let weightedTotal = 0;

  for (const ref of refPeaks) {
    const weight = ref.intensity / 100;
    weightedTotal += weight;
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < userPeaks.length; i++) {
      const userPeak = userPeaks[i];
      if (!userPeak) continue;
      const d = Math.abs(userPeak.twoTheta - ref.twoTheta);
      if (d <= toleranceDeg && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx !== null) {
      weightedMatched += weight;
    }
    details.push({ ref2t: ref.twoTheta, userIdx: bestIdx, matched: bestIdx !== null });
  }

  return {
    score: weightedTotal > 0 ? weightedMatched / weightedTotal : 0,
    matchedCount: details.filter((d) => d.matched).length,
    totalRef: refPeaks.length,
    details
  };
}

// ============================================================
// R163-spectra-4c-5a — generic match score (any spectrum type)
// ============================================================

export interface MatchScoreGenericResult {
  score: number;
  matchedCount: number;
  totalRef: number;
  details: { refPosition: number; userIdx: number | null; matched: boolean }[];
}

/**
 * Generic peak matching by extractable position field.
 *
 * Same algorithm as matchScore() but works for any spectrum where peaks
 * have a single position dimension (XRD 2θ, FTIR/Raman cm⁻¹, UV-Vis nm).
 *
 * @phase R163-spectra-4c-5a
 */
export function matchScoreGeneric<U, R extends { intensity: number }>(
  userPeaks: U[],
  refPeaks: R[],
  options: {
    userPosition: (peak: U) => number;
    refPosition: (peak: R) => number;
    tolerance: number;
  }
): MatchScoreGenericResult {
  const { userPosition, refPosition, tolerance } = options;
  const details: { refPosition: number; userIdx: number | null; matched: boolean }[] = [];
  let weightedMatched = 0;
  let weightedTotal = 0;

  for (const ref of refPeaks) {
    const weight = ref.intensity / 100;
    weightedTotal += weight;
    const refPos = refPosition(ref);
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < userPeaks.length; i++) {
      const userPeak = userPeaks[i];
      if (!userPeak) continue;
      const d = Math.abs(userPosition(userPeak) - refPos);
      if (d <= tolerance && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx !== null) weightedMatched += weight;
    details.push({ refPosition: refPos, userIdx: bestIdx, matched: bestIdx !== null });
  }

  return {
    score: weightedTotal > 0 ? weightedMatched / weightedTotal : 0,
    matchedCount: details.filter((d) => d.matched).length,
    totalRef: refPeaks.length,
    details
  };
}
