/**
 * Grounding orchestrator: runs L2 + L3 checks on AI response.
 * Returns aggregated warnings for UI display.
 * @phase R160-ai-5e-1
 */

import { findUnsourcedClaims, type UnsourcedClaim } from './citation-check';
import { buildNumberWhitelist, findUnverifiedNumbers, type NumberMatch } from './extract-numbers';

export interface GroundingResult {
  unverifiedNumbers: NumberMatch[];
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
    return { unverifiedNumbers: [], unsourcedClaims: [], totalWarnings: 0 };
  }

  // L3: Numerical guard
  const whitelist = buildNumberWhitelist(chunks.map((c) => c.text));
  const unverifiedNumbers = findUnverifiedNumbers(responseText, whitelist);

  // L2: Citation enforcement
  const unsourcedClaims = findUnsourcedClaims(responseText);

  return {
    unverifiedNumbers,
    unsourcedClaims,
    totalWarnings: unverifiedNumbers.length + unsourcedClaims.length
  };
}

export type { NumberMatch, UnsourcedClaim };
