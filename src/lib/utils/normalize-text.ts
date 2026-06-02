/**
 * Normalize free-text bibliographic strings (titles, author + journal names)
 * that arrive from PDFs, LLM extraction, Crossref and OpenAlex.
 *
 * Publishers routinely emit Unicode look-alikes — U+2010 HYPHEN instead of the
 * ASCII '-', non-breaking hyphens, zero-width characters, NBSP, and JATS/HTML
 * markup or entities (e.g. `<sub>`, `&amp;`). Those render as "junk", break
 * search/matching, and look unprofessional. We fold them to clean text while
 * PRESERVING meaningful punctuation: en-dash (–), em-dash (—), minus sign (−)
 * and accented / non-Latin letters (e.g. Vietnamese diacritics) are kept as-is.
 *
 * @phase R310-text-normalization
 */

const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

// Hyphen look-alikes → ASCII '-'. Intentionally EXCLUDES en-dash (U+2013),
// em-dash (U+2014) and minus sign (U+2212), which carry meaning in titles and
// chemical formulae (e.g. "structure–property", "WO3−x").
const HYPHEN_LIKE_RE = /[\u2010\u2011\u2012\u2043\uFE58\uFE63\uFF0D]/g;
// Alternation (not a character class) — a class containing the zero-width
// joiner/non-joiner trips eslint/no-misleading-character-class.
const ZERO_WIDTH_RE = /\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/g;
const ODD_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff) {
        try {
          return String.fromCodePoint(cp);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Clean a bibliographic string. Returns `undefined` for empty/whitespace input
 * so callers can keep optional-field semantics.
 */
export function cleanText(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  let s = input.normalize('NFC');
  s = decodeEntities(s); // decode first so entity-encoded tags are then stripped
  s = s.replace(TAG_RE, '');
  s = s.replace(HYPHEN_LIKE_RE, '-').replace(ZERO_WIDTH_RE, '').replace(ODD_SPACE_RE, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : undefined;
}

/** Clean an array of strings, dropping any that become empty. */
export function cleanTextList(input: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input.map((s) => cleanText(s)).filter((s): s is string => Boolean(s));
  return out.length > 0 ? out : undefined;
}
