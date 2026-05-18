/**
 * Paper metadata loader + citation key builder for T4 Writer.
 *
 * Loads paper docs from tenants/{tid}/papers/{paperId} to build proper
 * academic citation keys ([authorYear]) instead of chunk hash IDs.
 *
 * @phase R175-1
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';

export interface PaperMetadata {
  paperId: string;
  authors: string[]; // e.g. ['Smith, J.', 'Doe, K.']
  year?: number;
  title?: string;
}

const MAX_PAPERS = 20;

/**
 * Load metadata for a batch of paperIds.
 * Returns Map paperId → metadata. Missing papers omitted from map.
 */
export async function loadPapersMetadata(
  tenantId: string,
  paperIds: string[]
): Promise<Map<string, PaperMetadata>> {
  const result = new Map<string, PaperMetadata>();
  if (paperIds.length === 0) return result;

  const unique = [...new Set(paperIds)].slice(0, MAX_PAPERS);
  const db = getAdminFirestoreService();

  // Batch load
  const reads = unique.map((paperId) =>
    db
      .doc(`tenants/${tenantId}/papers/${paperId}`)
      .get()
      .then((snap) => ({ paperId, snap }))
      .catch(() => ({ paperId, snap: null }))
  );
  const snaps = await Promise.all(reads);

  for (const { paperId, snap } of snaps) {
    if (!snap?.exists) continue;
    const data = snap.data();
    if (!data) continue;

    const authorsField = data.authors;
    const authors = Array.isArray(authorsField)
      ? authorsField.map((a: unknown) => String(a))
      : typeof authorsField === 'string'
        ? authorsField.split(/[,;]/).map((s: string) => s.trim())
        : [];

    result.set(paperId, {
      paperId,
      authors,
      year: typeof data.year === 'number' ? data.year : undefined,
      title: typeof data.title === 'string' ? data.title : undefined
    });
  }

  return result;
}

/**
 * Strip Vietnamese diacritics for citation key generation.
 * "Nguyễn Văn A" → "nguyen van a"
 */
function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Extract surname from author string.
 *   "Smith, J."       → "smith"
 *   "John Smith"      → "smith"
 *   "Nguyễn Văn A"    → "nguyen"
 *   ""                → "anon"
 */
function extractSurname(authorString: string): string {
  const cleaned = stripDiacritics(authorString.trim()).toLowerCase();
  if (!cleaned) return 'anon';

  // "Last, First" format — first part is surname
  if (cleaned.includes(',')) {
    const surname = cleaned.split(',')[0].trim();
    return surname.replace(/[^a-z]/g, '') || 'anon';
  }

  // "First Last" format — for Vietnamese names, first word is family name
  // For Western names, last word is surname
  // Heuristic: if contains Vietnamese-derived diacritics-stripped patterns,
  // assume Vietnamese order. Otherwise Western.
  // Simple heuristic: just take first word as surname for VI bias.
  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'anon';

  // Heuristic: Vietnamese names often start with surnames like Nguyen, Tran, Le, Pham
  const viSurnames = new Set([
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
  if (viSurnames.has(parts[0])) {
    return parts[0];
  }

  // Default: last word as surname (Western order)
  const last = parts[parts.length - 1];
  return last.replace(/[^a-z]/g, '') || 'anon';
}

/**
 * Build unique citation key like "smith2024".
 * Handles collisions with suffix a/b/c/...
 */
export function buildCitationKey(meta: PaperMetadata, existingKeys: Set<string>): string {
  const firstAuthor = meta.authors[0] ?? '';
  const surname = extractSurname(firstAuthor);
  const year = meta.year ?? new Date().getFullYear();
  const base = `${surname}${year}`;

  if (!existingKeys.has(base)) {
    return base;
  }

  // Collision — add suffix a, b, c, ...
  for (let i = 0; i < 26; i++) {
    const suffix = String.fromCharCode('a'.charCodeAt(0) + i);
    const candidate = `${base}${suffix}`;
    if (!existingKeys.has(candidate)) {
      return candidate;
    }
  }

  // Fallback after 26 collisions (very unlikely)
  return `${base}${Date.now().toString(36).slice(-3)}`;
}

/**
 * Build citation key for paper without metadata (fallback).
 * Uses 'unknown' + year if no info available.
 */
export function fallbackCitationKey(paperId: string, existingKeys: Set<string>): string {
  const slug = paperId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);
  const base = `unknown${slug}`;
  if (!existingKeys.has(base)) return base;
  return `${base}${Date.now().toString(36).slice(-3)}`;
}
