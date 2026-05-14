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
function parseHkl(hkl: string | undefined): number[] {
  if (!hkl) return [];
  const cleaned = hkl.replace(/[()]/g, '').trim();
  // Split by whitespace; if single token of 3 digits, split per char.
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (tokens.length === 1 && first !== undefined && /^-?\d{3}$/.test(first)) {
    return first.split('').map(Number);
  }
  const nums = tokens.map((t) => Number.parseInt(t, 10)).filter((n) => !Number.isNaN(n));
  return nums.length > 0 ? nums : [];
}

export function computeInternalCandidates(
  userPeaks: XRDPeak[],
  refCards: ReferenceCard[]
): CitationCandidate[] {
  if (userPeaks.length === 0 || refCards.length === 0) return [];

  const userPeaksSimple = userPeaks.map((p) => ({
    twoTheta: p.two_theta,
    intensity: p.intensity
  }));

  const candidates: CitationCandidate[] = [];

  for (const card of refCards) {
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

  candidates.sort((a, b) => b.match_score - a.match_score);
  return candidates;
}
