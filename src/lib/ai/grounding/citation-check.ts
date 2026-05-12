/**
 * Citation enforcement: detect specific claims that should have citation chips.
 * Looks at each sentence in the response. If it contains specific entities
 * (proper nouns, specific numbers, quoted text) but lacks a nearby [N] chip,
 * flag it as "unsourced claim".
 * @phase R160-ai-5e-1
 */

export interface UnsourcedClaim {
  sentence: string;
  reason: string;
  line: number;
}

const SPECIFIC_CLAIM_PATTERNS = [
  // Author citations
  { regex: /\b[A-Z][a-z]+\s+(?:et\s+al\.|and\s+[A-Z][a-z]+)/, reason: 'author citation' },
  // Specific numerical claims (with units or %)
  {
    regex:
      /\b\d+(?:\.\d+)?\s*(?:%|nm|μm|°C|eV|mA|V|Ω|kΩ|MΩ|Hz|kHz|MHz|GHz|min|h|day|year|wt%|mol%)/i,
    reason: 'specific value'
  },
  // Quoted text
  { regex: /["“][^"”]{10,}["”]/, reason: 'direct quote' },
  // Specific years (1900-2100)
  { regex: /\b(?:19|20)\d{2}\b/, reason: 'specific year' }
];

const CITATION_PATTERN = /\[(\d+)\]/;

/**
 * Split text into sentences (Vietnamese + English aware).
 * Simple period/exclamation/question split, but respects abbreviations.
 */
function splitSentences(text: string): string[] {
  // Replace common abbreviations to protect them
  const protected_ = text
    .replace(/et\s+al\./gi, 'et__al')
    .replace(/i\.e\./gi, 'i__e')
    .replace(/e\.g\./gi, 'e__g')
    .replace(/vs\./gi, 'vs__');
  return protected_
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s
        .replace(/et__al/gi, 'et al.')
        .replace(/i__e/gi, 'i.e.')
        .replace(/e__g/gi, 'e.g.')
        .replace(/vs__/gi, 'vs.')
        .trim()
    )
    .filter((s) => s.length > 0);
}

/**
 * Check each sentence for specific claims without nearby citations.
 */
export function findUnsourcedClaims(responseText: string): UnsourcedClaim[] {
  const sentences = splitSentences(responseText);
  const unsourced: UnsourcedClaim[] = [];
  let charOffset = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const hasCitation = CITATION_PATTERN.test(sentence);

    if (!hasCitation) {
      // Check if neighboring sentences (±1) have citations (group claims allowed)
      const neighborHasCitation =
        (i > 0 && CITATION_PATTERN.test(sentences[i - 1])) ||
        (i < sentences.length - 1 && CITATION_PATTERN.test(sentences[i + 1]));

      if (!neighborHasCitation) {
        // Sentence has no citation nearby. Check for specific claim patterns.
        for (const { regex, reason } of SPECIFIC_CLAIM_PATTERNS) {
          if (regex.test(sentence)) {
            unsourced.push({
              sentence: sentence.length > 120 ? sentence.slice(0, 117) + '...' : sentence,
              reason,
              line: i
            });
            break;
          }
        }
      }
    }
    charOffset += sentence.length + 1;
  }

  return unsourced;
}
