/**
 * Fuzzy title search for papers using fuse.js (R179-7c).
 *
 * Wrapper to keep Fuse config + threshold in one place. Searches title +
 * authors + DOI to give "everything I know" search across paper metadata.
 *
 * @phase R179-7c
 * @r179-7-applied
 */
import Fuse from 'fuse.js';
import type { Paper } from '@/types/papers';

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<Paper>>[1] = {
  // Lower = stricter. 0.4 = decent typo tolerance for English titles.
  threshold: 0.4,
  // Sort by score (best match first)
  shouldSort: true,
  // Search across multiple fields with weights
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'authors', weight: 0.25 },
    { name: 'doi', weight: 0.1 },
    { name: 'journal', weight: 0.05 }
  ],
  // Don't bother matching very short queries
  minMatchCharLength: 2,
  // Distance penalty (higher = looser)
  distance: 200,
  ignoreLocation: true
};

export function searchPapers(papers: Paper[], query: string): Paper[] {
  const q = query.trim();
  if (!q) return papers;

  // A single character falls below Fuse's minMatchCharLength: the fuzzy bitap
  // then returns noise (e.g. typing "c" surfaces papers that merely contain a
  // 'c' mid-word instead of the ones whose title starts with C). For 1-char
  // queries do a deterministic title-prefix match — exactly "papers starting
  // with C". Two+ characters keep the fuzzy multi-field search (typo tolerance).
  if (q.length < 2) {
    const lc = q.toLowerCase();
    return papers.filter((p) => (p.title ?? '').trimStart().toLowerCase().startsWith(lc));
  }

  const fuse = new Fuse(papers, FUSE_OPTIONS);
  return fuse.search(q).map((r) => r.item);
}
