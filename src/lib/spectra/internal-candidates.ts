/**
 * Compute internal CitationCandidate[] from tenant reference cards.
 *
 * Runs the existing matchScore() against every reference card, then maps
 * to the worker's CitationCandidate shape so it merges into XRDPhaseSummary
 * without further branching.
 *
 * Threshold (0.3) intentionally matches worker default — keeps Trust > Coverage:
 * cards with weak peak overlap are excluded entirely rather than shown as low
 * confidence.
 *
 * @phase R162-spectra-4b
 */

import { matchScore } from '@/lib/spectra/match-score';
import type { ReferenceCard } from '@/types/spectra';
import type { CitationCandidate, XRDPeak } from '@/types/spectra-analysis';

const THRESHOLD = 0.3;

/**
 * Parse hkl from string format ("1 0 0", "(1 0 0)", "100") to number array.
 * Returns [] if unparseable. Reference card schema stores hkl as string;
 * CitationCandidate schema expects number[].
 */
/**
 * Parse hkl from string format to number array.
 *
 * Supported formats:
 *   "1 0 0"     → [1, 0, 0]
 *   "(1 0 0)"   → [1, 0, 0]   (crystallographic parentheses)
 *   "100"       → [1, 0, 0]   (compact 3-digit)
 *   "1̄ 0 0"     → [-1, 0, 0]  (Unicode overline U+0304 for negative h)
 *   "-1 0 0"    → [-1, 0, 0]
 *
 * Returns [] if unparseable.
 */
function parseHkl(hkl: string | undefined): number[] {
  if (!hkl) return [];
  // Strip crystallographic parentheses + braces
  let cleaned = hkl.replace(/[(){}[\]]/g, '').trim();
  // Normalize Unicode combining overline (U+0304) → ASCII minus prefix.
  // "1̄" (1 + U+0304) → "-1"
  cleaned = cleaned.replace(/(\d)\u0304/g, '-$1');

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (tokens.length === 1 && first !== undefined && /^-?\d{3}$/.test(first)) {
    // Compact form like "100" or "-100" — split per char (preserve sign on first)
    const sign = first.startsWith('-') ? -1 : 1;
    const digits = first.replace(/^-/, '').split('').map(Number);
    return digits.length === 3 ? [sign * digits[0]!, digits[1]!, digits[2]!] : digits;
  }
  const nums = tokens.map((t) => Number.parseInt(t, 10)).filter((n) => !Number.isNaN(n));
  return nums.length > 0 ? nums : [];
}

export function computeInternalCandidates(
  userPeaks: XRDPeak[],
  refCards: ReferenceCard[]
): CitationCandidate[] {
  if (userPeaks.length === 0 || refCards.length === 0) return [];

  // R163-4c-2: pipeline is XRD-only; filter out other spectrum types
  // (FTIR/Raman/UVVis integration comes in 4c-5).
  const xrdCards = refCards.filter(
    (c): c is import('@/types/spectra').XRDReferenceCard => c.spectrumType === 'xrd'
  );
  if (xrdCards.length === 0) return [];

  const userPeaksSimple = userPeaks.map((p) => ({
    twoTheta: p.two_theta,
    intensity: p.intensity
  }));

  const candidates: CitationCandidate[] = [];

  for (const card of xrdCards) {
    const result = matchScore(userPeaksSimple, card.peaks);
    if (result.score < THRESHOLD) continue;

    candidates.push({
      citation: {
        source: 'internal',
        id: card.id,
        title: card.phaseName,
        authors: card.notes ?? null,
        journal: null,
        year: null,
        doi: null,
        url: null
      },
      formula: card.formula ?? '',
      space_group: card.spaceGroup ?? '',
      space_group_number: null,
      crystal_system: null,
      lattice_a: null,
      lattice_b: null,
      lattice_c: null,
      lattice_alpha: null,
      lattice_beta: null,
      lattice_gamma: null,
      simulated_peaks: card.peaks.map((p) => ({
        twotheta: p.twoTheta,
        intensity: p.intensity,
        relative_intensity: p.intensity,
        multiplicity: 1,
        hkl: parseHkl(p.hkl)
      })),
      match_score: result.score,
      matched_peaks_count: result.matchedCount,
      total_user_peaks: userPeaks.length,
      intensity_correlation: null,
      user_hkl_map: {}
    });
  }

  return candidates.toSorted((a, b) => b.match_score - a.match_score);
}
