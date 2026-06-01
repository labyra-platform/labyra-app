/**
 * Pure citation-key construction for T4 Writer — NO firebase / server-only, so
 * it is unit-testable and safe to import anywhere. Firestore metadata loading
 * lives in citation-loader.ts (server-only).
 *
 * @phase R175-1 (R276: split pure logic out + never fabricate a year)
 */

export interface PaperMetadata {
  paperId: string;
  authors: string[]; // e.g. ['Smith, J.', 'Doe, K.']
  year?: number;
  title?: string;
}

/** Strip Vietnamese diacritics for key generation. "Nguyễn Văn A" → "nguyen van a". */
function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const VI_SURNAMES = new Set([
  'nguyen',
  'tran',
  'le',
  'pham',
  'hoang',
  'huynh',
  'phan',
  'vu',
  'vo',
  'dang',
  'bui',
  'do',
  'ho',
  'ngo',
  'duong',
  'ly'
]);

/**
 * Extract surname from an author string.
 *   "Smith, J." → "smith" · "John Smith" → "smith" · "Nguyễn Văn A" → "nguyen" · "" → "anon"
 */
function extractSurname(authorString: string): string {
  const cleaned = stripDiacritics(authorString.trim()).toLowerCase();
  if (!cleaned) return 'anon';

  // "Last, First" — first part is the surname.
  if (cleaned.includes(',')) {
    const surname = cleaned.split(',')[0].trim();
    return surname.replace(/[^a-z]/g, '') || 'anon';
  }

  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'anon';
  // Vietnamese order: family name first.
  if (VI_SURNAMES.has(parts[0])) return parts[0];
  // Western order: surname last.
  const last = parts[parts.length - 1];
  return last.replace(/[^a-z]/g, '') || 'anon';
}

/**
 * Build a unique citation key like "smith2024". Collisions get an a/b/c suffix.
 */
export function buildCitationKey(meta: PaperMetadata, existingKeys: Set<string>): string {
  const firstAuthor = meta.authors[0] ?? '';
  const surname = extractSurname(firstAuthor);
  // R276: never fabricate a year. No year → 'nd' (no date, a standard academic
  // convention) — using the current year would invent a citation that looks
  // authoritative but is wrong (uy tín > tidiness).
  const yearPart = typeof meta.year === 'number' ? String(meta.year) : 'nd';
  const base = `${surname}${yearPart}`;

  if (!existingKeys.has(base)) return base;

  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode('a'.charCodeAt(0) + i)}`;
    if (!existingKeys.has(candidate)) return candidate;
  }
  // After 26 collisions (very unlikely) — deterministic-ish unique tail.
  return `${base}${Date.now().toString(36).slice(-3)}`;
}

/** Fallback key for a paper with no usable metadata. */
export function fallbackCitationKey(paperId: string, existingKeys: Set<string>): string {
  const slug = paperId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);
  const base = `unknown${slug}`;
  if (!existingKeys.has(base)) return base;
  return `${base}${Date.now().toString(36).slice(-3)}`;
}
