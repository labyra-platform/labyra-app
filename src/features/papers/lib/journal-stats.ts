/**
 * Aggregate journal/year/domain stats from paper list (R179-2).
 *
 * Pure client-side computation — no Firestore aggregation queries (which
 * would require a separate Cloud Function). Runs on the same Paper[] that
 * usePapers() returns.
 *
 * @phase R179-2
 * @r179-2-applied
 */
import type { Paper } from '@/types/papers';

export interface JournalStats {
  /** Full name, e.g. "Journal of Materials Chemistry A". Empty = unclassified. */
  name: string;
  /** Short form for chip display, falls back to name. */
  short: string;
  /** Number of papers in this tenant. */
  count: number;
  /** Min/max year range across this journal's papers. */
  yearMin: number;
  yearMax: number;
  /** First non-empty ISSN seen. */
  issn: string;
}

export function aggregateJournalStats(papers: Paper[]): JournalStats[] {
  const map = new Map<string, JournalStats>();
  for (const p of papers) {
    const name = (p.journal ?? '').trim();
    if (!name) continue;
    const existing = map.get(name);
    if (existing) {
      existing.count++;
      if (p.year > 0) {
        existing.yearMin = Math.min(existing.yearMin, p.year);
        existing.yearMax = Math.max(existing.yearMax, p.year);
      }
      if (!existing.issn && p.journalIssn && p.journalIssn.length > 0) {
        existing.issn = p.journalIssn[0];
      }
    } else {
      map.set(name, {
        name,
        short: (p.journalShort ?? '').trim() || name,
        count: 1,
        yearMin: p.year > 0 ? p.year : Number.POSITIVE_INFINITY,
        yearMax: p.year > 0 ? p.year : 0,
        issn: p.journalIssn?.[0] ?? ''
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export interface YearRange {
  min: number;
  max: number;
}

export function aggregateYearRange(papers: Paper[]): YearRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const p of papers) {
    if (p.year > 0) {
      if (p.year < min) min = p.year;
      if (p.year > max) max = p.year;
    }
  }
  if (max === 0) return null;
  return { min, max };
}
