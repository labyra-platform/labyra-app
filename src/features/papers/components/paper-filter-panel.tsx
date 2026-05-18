'use client';

/**
 * Combined paper filter panel — year range + journal multi-select + domain (R179-2).
 *
 * Composed from PaperDomainFilter (R178-3) + new journal chip group + dual
 * year input. Controlled component, parent owns full FilterValue state.
 *
 * @phase R179-2
 * @r179-2-applied
 */
import { IconCalendar, IconBook, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  createEmptyDomainFilter,
  type DomainFilterValue,
  PaperDomainFilter
} from './paper-domain-filter';
import {
  aggregateJournalStats,
  aggregateYearRange,
  type JournalStats
} from '@/features/papers/lib/journal-stats';
import { cn } from '@/lib/utils';
import type { Paper } from '@/types/papers';

export interface PaperFilterValue {
  domain: DomainFilterValue;
  /** Selected journal names. Empty = no journal filter. */
  journals: Set<string>;
  /** Inclusive year range. null = no year filter. */
  yearMin: number | null;
  yearMax: number | null;
}

export function createEmptyPaperFilter(): PaperFilterValue {
  return {
    domain: createEmptyDomainFilter(),
    journals: new Set(),
    yearMin: null,
    yearMax: null
  };
}

interface Props {
  value: PaperFilterValue;
  onChange: (next: PaperFilterValue) => void;
  papers: Paper[];
  visibleDomainSlugs?: Set<string>;
}

export function PaperFilterPanel({ value, onChange, papers, visibleDomainSlugs }: Props) {
  const t = useTranslations('papers');
  const [journalSearch, setJournalSearch] = useState('');

  const journalStats = useMemo(() => aggregateJournalStats(papers), [papers]);
  const yearRange = useMemo(() => aggregateYearRange(papers), [papers]);

  const filteredJournals = useMemo(() => {
    const q = journalSearch.trim().toLowerCase();
    if (!q) return journalStats;
    return journalStats.filter(
      (j) => j.name.toLowerCase().includes(q) || j.short.toLowerCase().includes(q)
    );
  }, [journalStats, journalSearch]);

  const hasJournalSelection = value.journals.size > 0;
  const hasYearFilter = value.yearMin !== null || value.yearMax !== null;

  function toggleJournal(name: string): void {
    const next = new Set(value.journals);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...value, journals: next });
  }

  function clearJournals(): void {
    onChange({ ...value, journals: new Set() });
  }

  function setYearMin(v: number | null): void {
    onChange({ ...value, yearMin: v });
  }

  function setYearMax(v: number | null): void {
    onChange({ ...value, yearMax: v });
  }

  function clearYear(): void {
    onChange({ ...value, yearMin: null, yearMax: null });
  }

  return (
    <div className='space-y-3 border rounded-lg p-3'>
      {/* Year range */}
      {yearRange && (
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <IconCalendar className='size-3.5' aria-hidden />
              <span>{t('filterYearLabel')}</span>
            </div>
            {hasYearFilter && (
              <button
                type='button'
                onClick={clearYear}
                className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                <IconX className='size-3' aria-hidden />
                {t('filterClear')}
              </button>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <input
              type='number'
              min={yearRange.min}
              max={yearRange.max}
              placeholder={String(yearRange.min)}
              value={value.yearMin ?? ''}
              onChange={(e) => setYearMin(e.target.value ? Number(e.target.value) : null)}
              className='w-20 rounded border px-2 py-1 text-xs'
              aria-label={t('filterYearMin')}
            />
            <span className='text-muted-foreground text-xs'>—</span>
            <input
              type='number'
              min={yearRange.min}
              max={yearRange.max}
              placeholder={String(yearRange.max)}
              value={value.yearMax ?? ''}
              onChange={(e) => setYearMax(e.target.value ? Number(e.target.value) : null)}
              className='w-20 rounded border px-2 py-1 text-xs'
              aria-label={t('filterYearMax')}
            />
            <span className='text-muted-foreground text-[10px]'>
              ({yearRange.min}–{yearRange.max})
            </span>
          </div>
        </div>
      )}

      {/* Journal multi-select */}
      {journalStats.length > 0 && (
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <IconBook className='size-3.5' aria-hidden />
              <span>
                {t('filterJournalLabel')} ({journalStats.length})
              </span>
            </div>
            {hasJournalSelection && (
              <button
                type='button'
                onClick={clearJournals}
                className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                <IconX className='size-3' aria-hidden />
                {t('filterClear')} ({value.journals.size})
              </button>
            )}
          </div>

          {journalStats.length > 6 && (
            <input
              type='text'
              placeholder={t('filterJournalSearch')}
              value={journalSearch}
              onChange={(e) => setJournalSearch(e.target.value)}
              className='w-full rounded border px-2 py-1 text-xs'
            />
          )}

          <div className='flex flex-wrap gap-1.5 max-h-32 overflow-y-auto'>
            {filteredJournals.map((j: JournalStats) => {
              const active = value.journals.has(j.name);
              return (
                <button
                  key={j.name}
                  type='button'
                  onClick={() => toggleJournal(j.name)}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs transition-colors',
                    active
                      ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/40'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                  )}
                  aria-pressed={active}
                  title={j.name}
                >
                  <span className='truncate max-w-[180px]'>{j.short}</span>
                  <span className='text-[10px] opacity-60'>{j.count}</span>
                </button>
              );
            })}
            {filteredJournals.length === 0 && (
              <span className='text-xs text-muted-foreground'>{t('filterJournalNoMatch')}</span>
            )}
          </div>
        </div>
      )}

      {/* Domain (delegated to existing component) */}
      <PaperDomainFilter
        value={value.domain}
        onChange={(d) => onChange({ ...value, domain: d })}
        visibleSlugs={visibleDomainSlugs}
      />
    </div>
  );
}

/** Pure predicate — apply PaperFilterValue to a paper. */
export function paperPassesFilter(paper: Paper, filter: PaperFilterValue): boolean {
  // Year
  if (filter.yearMin !== null && paper.year > 0 && paper.year < filter.yearMin) return false;
  if (filter.yearMax !== null && paper.year > 0 && paper.year > filter.yearMax) return false;

  // Journal
  if (filter.journals.size > 0) {
    if (!paper.journal || !filter.journals.has(paper.journal)) return false;
  }

  // Domain (OR-logic: primary domain OR any subtopic matches selected)
  if (filter.domain.selected.size > 0) {
    let domainMatch = false;
    if (paper.domain && filter.domain.selected.has(paper.domain)) domainMatch = true;
    if (!domainMatch && paper.subtopics) {
      for (const s of paper.subtopics) {
        if (filter.domain.selected.has(s)) {
          domainMatch = true;
          break;
        }
      }
    }
    if (!domainMatch) return false;
  }

  return true;
}
