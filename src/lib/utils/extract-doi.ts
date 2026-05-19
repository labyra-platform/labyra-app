/**
 * DOI extraction utility.
 *
 * Priority order (highest confidence first):
 *   1. https://doi.org/10.XXXX/...
 *   2. http://dx.doi.org/10.XXXX/...
 *   3. doi:10.XXXX/...  (case-insensitive prefix)
 *   4. 10.XXXX/...      (bare, after whitespace/punctuation)
 *
 * Strips trailing punctuation that commonly appears in PDF text extraction.
 *
 * @phase R183-2-material-knowledge-card
 */

const DOI_CORE_RE = /10\.\d{4,9}\/[^\s"'<>\])}]+/g;

const STRIP_TRAILING_RE = /[.,;)\]}>'":]+$/;

interface ExtractedDoi {
  doi: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Extract all DOIs from a text string.
 * Returns deduplicated list ordered by confidence.
 */
export function extractDois(text: string): ExtractedDoi[] {
  const results: Map<string, ExtractedDoi> = new Map();

  // High confidence: doi.org URL
  const doiOrgRe = /https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^\s"'<>\])}]+)/gi;
  for (const m of text.matchAll(doiOrgRe)) {
    const doi = m[1].replace(STRIP_TRAILING_RE, '');
    if (!results.has(doi)) results.set(doi, { doi, confidence: 'high' });
  }

  // Medium confidence: doi: prefix
  const doiPrefixRe = /\bdoi:\s*(10\.\d{4,9}\/[^\s"'<>\])}]+)/gi;
  for (const m of text.matchAll(doiPrefixRe)) {
    const doi = m[1].replace(STRIP_TRAILING_RE, '');
    if (!results.has(doi)) results.set(doi, { doi, confidence: 'medium' });
  }

  // Low confidence: bare 10.XXXX/ after word boundary
  for (const m of text.matchAll(DOI_CORE_RE)) {
    const doi = m[0].replace(STRIP_TRAILING_RE, '');
    if (!results.has(doi)) results.set(doi, { doi, confidence: 'low' });
  }

  // Sort: high → medium → low
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...results.values()].sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * Extract first DOI found (highest confidence).
 */
export function extractFirstDoi(text: string): string | null {
  return extractDois(text)[0]?.doi ?? null;
}
