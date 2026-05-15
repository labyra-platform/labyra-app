/**
 * Extract DOI references from paper full text.
 *
 * Strategy:
 *   1. Find "References" / "Bibliography" / "Works Cited" section header
 *   2. Extract all DOI-format strings from that section
 *   3. Capture ~50 chars context around each DOI for audit
 *
 * Falls back to whole-document scan if no section header found.
 *
 * @phase R166-ai6a-3a
 */
import 'server-only';
import { DOI_REGEX } from '@/lib/schemas/citation-schema';

// Global DOI regex for scanning text (R168-3.3 strict shape)
const DOI_SCAN_REGEX = /\b10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]*[a-zA-Z0-9](?![.\d])/g;

// Common section headers — case insensitive, anchored to line start
const SECTION_HEADERS = [
  /^[\s\d.]*references[\s.:]*$/im,
  /^[\s\d.]*bibliography[\s.:]*$/im,
  /^[\s\d.]*works cited[\s.:]*$/im,
  /^[\s\d.]*literature cited[\s.:]*$/im,
  /^[\s\d.]*tài liệu tham khảo[\s.:]*$/im
];

export interface ExtractedReference {
  doi: string;
  context: string;
}

/**
 * Find references section start index in full text. Returns -1 if not found.
 */
function findReferencesSectionStart(text: string): number {
  for (const re of SECTION_HEADERS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      // Take the LAST occurrence (in case word "references" appears earlier)
      let lastIdx = m.index;
      let nextIdx = m.index;
      while ((nextIdx = text.indexOf(m[0], nextIdx + 1)) !== -1) {
        lastIdx = nextIdx;
      }
      return lastIdx;
    }
  }
  return -1;
}

/**
 * Extract unique DOIs from paper full text.
 *
 * @param fullText OCR output of paper (markdown or plain text)
 * @param maxResults safety cap to avoid extracting 500 DOIs from a meta-analysis
 * @returns deduplicated list of {doi, context} ordered by appearance
 */
export function extractDoisFromText(
  fullText: string,
  maxResults: number = 100
): ExtractedReference[] {
  if (!fullText || typeof fullText !== 'string') return [];

  // Prefer scanning only the references section (higher precision)
  const sectionStart = findReferencesSectionStart(fullText);
  const scanText = sectionStart >= 0 ? fullText.slice(sectionStart) : fullText;

  const results: ExtractedReference[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  // Reset lastIndex (regex with `g` flag is stateful)
  DOI_SCAN_REGEX.lastIndex = 0;
  while ((match = DOI_SCAN_REGEX.exec(scanText)) !== null) {
    if (results.length >= maxResults) break;
    let doi = match[0];

    // Clean trailing punctuation/whitespace that regex greedy might include
    doi = doi.replace(/[.,;)\]\s]+$/, '');

    // Validate against strict regex
    if (!DOI_REGEX.test(doi)) continue;

    // Normalize to lowercase for dedup (DOIs are case-insensitive per CrossRef)
    const key = doi.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Capture ±25 chars context
    const ctxStart = Math.max(0, match.index - 25);
    const ctxEnd = Math.min(scanText.length, match.index + doi.length + 25);
    const context = scanText.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();

    results.push({ doi, context });
  }

  return results;
}
