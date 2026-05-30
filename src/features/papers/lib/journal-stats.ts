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
  return Array.from(map.values()).toSorted((a, b) => b.count - a.count);
}

/**
 * R237cb: group OpenAlex subfields under their field for the filter tree.
 * Mirrors aggregatePublisherTree (field = publisher, subfield = journal).
 * Papers without an OpenAlex field are skipped (Gemini-only fallback).
 */
export interface OpenAlexSubfieldStat {
  /** Subfield display name. */
  name: string;
  /** Number of papers. */
  count: number;
}

export interface OpenAlexFieldGroup {
  /** Field display name, e.g. "Materials Science". */
  field: string;
  /** Total papers in this field. */
  count: number;
  /** Subfields under this field, sorted by count desc. */
  subfields: OpenAlexSubfieldStat[];
}

export function aggregateOpenAlexTree(papers: Paper[]): OpenAlexFieldGroup[] {
  // field -> (subfield -> count)
  const fields = new Map<string, Map<string, number>>();
  for (const p of papers) {
    const field = (p.openalexField ?? '').trim();
    if (!field) continue;
    const subfield = (p.openalexSubfield ?? '').trim() || '—';
    const subs = fields.get(field) ?? new Map<string, number>();
    subs.set(subfield, (subs.get(subfield) ?? 0) + 1);
    fields.set(field, subs);
  }
  const out: OpenAlexFieldGroup[] = [];
  for (const [field, subs] of fields) {
    const subfields = Array.from(subs, ([name, count]) => ({ name, count })).toSorted(
      (a, b) => b.count - a.count
    );
    out.push({
      field,
      count: subfields.reduce((n, s) => n + s.count, 0),
      subfields
    });
  }
  return out.toSorted((a, b) => b.count - a.count);
}

export interface YearRange {
  min: number;
  max: number;
}

/**
 * R237by: group journals under their publisher for the filter tree.
 * Each journal is mapped to the first publisher seen for it. Publishers are
 * sorted by paper count desc; the unclassified bucket ('') sorts last.
 */
export interface PublisherGroup {
  /** Publisher name (Crossref `message.publisher`). '' = unclassified. */
  publisher: string;
  /** Total papers across this publisher's journals. */
  count: number;
  /** Journals under this publisher, sorted by count desc. */
  journals: JournalStats[];
}

/**
 * R237ch: collapse publisher-name variants so the filter tree groups them as one
 * (e.g. "Elsevier BV" / "Elsevier Ltd" / "Elsevier Science" → "Elsevier"). Strips
 * trailing legal/entity suffixes, then maps a few well-known aliases. Display-only
 * — paper.publisher is untouched; this just controls grouping.
 */
const PUBLISHER_ALIASES: Record<string, string> = {
  elsevier: 'Elsevier',
  'elsevier science': 'Elsevier',
  'royal society of chemistry': 'Royal Society of Chemistry',
  rsc: 'Royal Society of Chemistry',
  'american chemical society': 'American Chemical Society',
  acs: 'American Chemical Society',
  springer: 'Springer',
  'springer nature': 'Springer Nature',
  nature: 'Springer Nature',
  'nature portfolio': 'Springer Nature',
  wiley: 'Wiley',
  'john wiley & sons': 'Wiley',
  'wiley-vch': 'Wiley',
  iop: 'IOP Publishing',
  'institute of physics': 'IOP Publishing',
  'taylor & francis': 'Taylor & Francis',
  mdpi: 'MDPI',
  aip: 'AIP Publishing',
  'american institute of physics': 'AIP Publishing'
};

export function normalizePublisher(publisher: string): string {
  let s = (publisher ?? '').trim();
  if (!s) return '';
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim(); // drop trailing "(RSC)", "(ACS)"…
  s = s
    .replace(
      /[\s,]+(B\.?V\.?|Ltd\.?|Limited|Inc\.?|LLC|GmbH|AG|S\.?A\.?|Co\.?|Company|Corp\.?|Corporation|Press|Publishing|Publications|Publishers?|Group|International)\.?$/gi,
      ''
    )
    .trim();
  return PUBLISHER_ALIASES[s.toLowerCase()] ?? s;
}

export function aggregatePublisherTree(papers: Paper[]): PublisherGroup[] {
  const journalStats = aggregateJournalStats(papers);
  const journalToPublisher = new Map<string, string>();
  for (const p of papers) {
    const journal = (p.journal ?? '').trim();
    if (journal && !journalToPublisher.has(journal)) {
      journalToPublisher.set(journal, normalizePublisher(p.publisher ?? ''));
    }
  }
  const groups = new Map<string, JournalStats[]>();
  for (const j of journalStats) {
    const pub = journalToPublisher.get(j.name) ?? '';
    const list = groups.get(pub);
    if (list) list.push(j);
    else groups.set(pub, [j]);
  }
  const out: PublisherGroup[] = [];
  for (const [publisher, journals] of groups) {
    out.push({
      publisher,
      count: journals.reduce((n, j) => n + j.count, 0),
      journals
    });
  }
  return out.toSorted(
    (a, b) => (a.publisher === '' ? 1 : 0) - (b.publisher === '' ? 1 : 0) || b.count - a.count
  );
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

/**
 * R229: count papers per domain slug (primary domain + subtopics), so the
 * filter can show how many papers each domain chip would match. A paper counts
 * once per distinct slug it carries.
 */
export function aggregateDomainCounts(papers: Paper[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of papers) {
    const slugs = new Set<string>();
    if (p.domain && p.domain !== 'unknown') slugs.add(p.domain);
    if (p.subtopics) for (const s of p.subtopics) slugs.add(s);
    for (const s of slugs) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return counts;
}
