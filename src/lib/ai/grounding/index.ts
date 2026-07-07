/**
 * Grounding orchestrator: runs L2 + L3 checks on AI response.
 * Returns aggregated warnings for UI display.
 * @phase R160-ai-5e-1
 */

import { findUnsourcedClaims, type UnsourcedClaim } from './citation-check';
import {
  buildNumberUnitMap,
  buildNumberWhitelist,
  findContradictedNumbers,
  findUnverifiedNumbers,
  type NumberMatch
} from './extract-numbers';

export interface GroundingResult {
  unverifiedNumbers: NumberMatch[];
  /** Values present in the sources but stated with a different unit (mis-stated). */
  contradictedNumbers: NumberMatch[];
  unsourcedClaims: UnsourcedClaim[];
  totalWarnings: number;
}

export interface ChunkInput {
  text: string;
}

/**
 * Check AI response grounding against retrieved chunks.
 * Only runs when chunks are present (RAG was triggered).
 */
export function checkGrounding(responseText: string, chunks: ChunkInput[]): GroundingResult {
  // No chunks = no RAG context = nothing to check (general knowledge response)
  if (chunks.length === 0) {
    return {
      unverifiedNumbers: [],
      contradictedNumbers: [],
      unsourcedClaims: [],
      totalWarnings: 0
    };
  }

  const chunkTexts = chunks.map((c) => c.text);

  // L3: Numerical guard — absent values (unverified) + present-but-wrong-unit
  // (contradicted, a stronger signal).
  const whitelist = buildNumberWhitelist(chunkTexts);
  const unitMap = buildNumberUnitMap(chunkTexts);
  const contradictedNumbers = findContradictedNumbers(responseText, unitMap);
  const contradictedRaw = new Set(contradictedNumbers.map((n) => n.raw));
  const unverifiedNumbers = findUnverifiedNumbers(responseText, whitelist).filter(
    (n) => !contradictedRaw.has(n.raw)
  );

  // L2: Citation enforcement
  const unsourcedClaims = findUnsourcedClaims(responseText);

  return {
    unverifiedNumbers,
    contradictedNumbers,
    unsourcedClaims,
    totalWarnings: unverifiedNumbers.length + contradictedNumbers.length + unsourcedClaims.length
  };
}

export type { NumberMatch, UnsourcedClaim };
