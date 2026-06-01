/**
 * Paper metadata loader for T4 Writer (Firestore reads — server-only).
 *
 * Pure citation-key construction lives in ./citation-key (unit-testable, no
 * firebase). Re-exported here so existing import sites keep working.
 *
 * @phase R175-1 (R276: pure logic split into citation-key.ts)
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { PaperMetadata } from './citation-key';

export type { PaperMetadata } from './citation-key';
export { buildCitationKey, fallbackCitationKey } from './citation-key';

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
