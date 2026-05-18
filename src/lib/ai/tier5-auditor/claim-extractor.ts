/**
 * Claim extraction — parse T3/T4 response into auditable claims.
 *
 * Heuristic-based extraction. Future R174+ may use Tier 0 LLM
 * for better claim segmentation.
 *
 * @phase R173-5
 */
import type { ClaimType, ExtractedClaim } from './types';

/** Match numerical values with units (e.g., "2.6 eV", "150 mA/cm²") */
const NUMERICAL_PATTERN =
  /(\d+(?:\.\d+)?)\s*([a-zA-ZμÅ°%/²³·\u00B0-\u00FF]+(?:[/.][a-zA-ZμÅ°²³·]+)*)/g;

/** Match citation patterns [keyYear] */
const CITATION_PATTERN = /\[([a-z]+\d{4}[a-z]?)\]/gi;

/** Mechanism indicators */
const MECHANISM_HINTS = [
  /due to/i,
  /caused by/i,
  /attributed to/i,
  /results from/i,
  /(?:do|bởi vì|gây ra)/i // Vietnamese
];

/** Definition indicators */
const DEFINITION_HINTS = [/is defined as/i, /refers to/i, /(?:là|được định nghĩa)/i];

export function extractClaims(responseText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  const lines = responseText.split(/\n+/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (line.length < 20) continue; // skip short lines

    // Split line into sentences
    const sentences = line.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length < 20) continue;

      const type = classifyClaim(trimmed);
      if (type) {
        claims.push({ text: trimmed, type, line: lineIdx + 1 });
      }
    }
  }

  // Dedupe identical claims
  const seen = new Set<string>();
  return claims.filter((c) => {
    const key = c.text.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyClaim(sentence: string): ClaimType | null {
  // Numerical claim — contains value+unit
  if (NUMERICAL_PATTERN.test(sentence)) {
    NUMERICAL_PATTERN.lastIndex = 0; // reset stateful regex
    return 'numerical';
  }

  // Citation claim — contains [keyYear]
  if (CITATION_PATTERN.test(sentence)) {
    CITATION_PATTERN.lastIndex = 0;
    return 'citation';
  }

  // Mechanism claim — contains causal language
  for (const pattern of MECHANISM_HINTS) {
    if (pattern.test(sentence)) return 'mechanism';
  }

  // Definition claim
  for (const pattern of DEFINITION_HINTS) {
    if (pattern.test(sentence)) return 'definition';
  }

  return null; // not an auditable claim
}
