'use client';

/**
 * Paper filter — search bar + Filters popover + active-filter chips (R199).
 *
 * Rewritten from the R179-2 flat panel onto shadcn primitives
 * (Input / Button / Popover / Command / Collapsible / Badge / ScrollArea).
 * Progressive disclosure: search always visible; year/journal/domain live in
 * a Popover so the paper list stays at the top. Active filters surface as
 * removable Badge chips below the bar.
 *
 * Filter logic (paperPassesFilter), journal aggregation, and the domain
 * taxonomy axes are UNCHANGED — this is a presentation-layer rewrite only.
 *
 * @phase R199
 */
import {
  IconBook,
  IconCalendar,
  IconChevronDown,
  IconFilter,
  IconSearch,
  IconX
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  AXIS_COLOR,
  APPLICATION_SLUGS,
  CHARACTERIZATION_SLUGS,
  type DomainAxis,
  MATERIALS_CLASS_SLUGS,
  META_SLUGS,
  SYNTHESIS_SLUGS
} from '@/features/papers/lib/taxonomy';
// Domain filter value (R199b: nhúng tại chỗ, gỡ phụ thuộc paper-domain-filter)
export interface DomainFilterValue {
  selected: Set<string>;
}

export function createEmptyDomainFilter(): DomainFilterValue {
  return { selected: new Set() };
}
import {
  aggregateJournalStats,
  aggregateYearRange,
  type JournalStats
} from '@/features/papers/lib/journal-stats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Paper } from '@/types/papers';

// ---------------------------------------------------------------------------
// Domain taxonomy axes (mirrors paper-domain-filter R178-3)
// ---------------------------------------------------------------------------
interface AxisGroup {
  axis: DomainAxis;
  i18nKey: string;
  slugs: ReadonlyArray<string>;
}

const AXIS_GROUPS: ReadonlyArray<AxisGroup> = [
  { axis: 'application', i18nKey: 'domainAxisApplication', slugs: APPLICATION_SLUGS },
  { axis: 'materials_class', i18nKey: 'domainAxisMaterials', slugs: MATERIALS_CLASS_SLUGS },
  { axis: 'synthesis', i18nKey: 'domainAxisSynthesis', slugs: SYNTHESIS_SLUGS },
  {
    axis: 'characterization',
    i18nKey: 'domainAxisCharacterization',
    slugs: CHARACTERIZATION_SLUGS
  },
  { axis: 'meta', i18nKey: 'domainAxisMeta', slugs: META_SLUGS }
];

// ---------------------------------------------------------------------------
// Combined filter value
// ---------------------------------------------------------------------------
export interface PaperFilterValue {
  domain: DomainFilterValue;
  journals: Set<string>;
  yearMin: number | null;
  yearMax: number | null;
  titleQuery: string;
}

export function createEmptyPaperFilter(): PaperFilterValue {
  return {
    domain: createEmptyDomainFilter(),
    journals: new Set(),
    yearMin: null,
    yearMax: null,
    titleQuery: ''
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

  // ---- counts ----
  const activeCount =
    value.domain.selected.size +
    value.journals.size +
    (value.yearMin !== null || value.yearMax !== null ? 1 : 0);

  const hasAny = activeCount > 0 || value.titleQuery.trim().length > 0;

  // ---- mutators ----
  function toggleJournal(name: string): void {
    const next = new Set(value.journals);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...value, journals: next });
  }

  function toggleDomain(slug: string): void {
    const next = new Set(value.domain.selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange({ ...value, domain: { selected: next } });
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
  function clearAll(): void {
    onChange(createEmptyPaperFilter());
    setJournalSearch('');
  }

  // domain slug -> axis color (for chips)
  const axisOf = useMemo(() => {
    const m = new Map<string, DomainAxis>();
    for (const g of AXIS_GROUPS) for (const s of g.slugs) m.set(s, g.axis);
    return m;
  }, []);

  return (
    <div className='space-y-2'>
      {/* ---- Bar: search + Filters popover + clear ---- */}
      <div className='flex items-center gap-2'>
        <div className='relative flex-1'>
          <IconSearch
            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            type='text'
            value={value.titleQuery}
            onChange={(e) => onChange({ ...value, titleQuery: e.target.value })}
            placeholder={t('filterTitleSearchPlaceholder')}
            aria-label={t('filterTitleSearchLabel')}
            className='pl-9'
          />
          {value.titleQuery && (
            <button
              type='button'
              onClick={() => onChange({ ...value, titleQuery: '' })}
              className='absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
              aria-label={t('filterClear')}
            >
              <IconX className='size-4' aria-hidden />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant='outline' className='gap-2'>
              <IconFilter className='size-4' aria-hidden />
              {t('filtersButton')}
              {activeCount > 0 && (
                <Badge variant='secondary' className='ml-0.5 px-1.5 tabular-nums'>
                  {activeCount}
                </Badge>
              )}
              <IconChevronDown className='size-3.5 opacity-60' aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-[clamp(20rem,90vw,26rem)] p-0'>
            <ScrollArea className='max-h-[min(70vh,32rem)]'>
              <div className='space-y-4 p-4'>
                {/* Year range */}
                {yearRange && (
                  <section className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-1.5 text-sm font-medium'>
                        <IconCalendar className='size-4 text-muted-foreground' aria-hidden />
                        {t('filterYearLabel')}
                      </div>
                      {(value.yearMin !== null || value.yearMax !== null) && (
                        <button
                          type='button'
                          onClick={clearYear}
                          className='text-xs text-muted-foreground hover:text-foreground'
                        >
                          {t('filterClear')}
                        </button>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      <Input
                        type='number'
                        inputMode='numeric'
                        min={yearRange.min}
                        max={yearRange.max}
                        placeholder={String(yearRange.min)}
                        value={value.yearMin ?? ''}
                        onChange={(e) => setYearMin(e.target.value ? Number(e.target.value) : null)}
                        aria-label={t('filterYearMin')}
                        className='h-9 w-24'
                      />
                      <span className='text-muted-foreground'>—</span>
                      <Input
                        type='number'
                        inputMode='numeric'
                        min={yearRange.min}
                        max={yearRange.max}
                        placeholder={String(yearRange.max)}
                        value={value.yearMax ?? ''}
                        onChange={(e) => setYearMax(e.target.value ? Number(e.target.value) : null)}
                        aria-label={t('filterYearMax')}
                        className='h-9 w-24'
                      />
                      <span className='text-xs text-muted-foreground'>
                        {yearRange.min}–{yearRange.max}
                      </span>
                    </div>
                  </section>
                )}

                {/* Journal */}
                {journalStats.length > 0 && (
                  <section className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-1.5 text-sm font-medium'>
                        <IconBook className='size-4 text-muted-foreground' aria-hidden />
                        {t('filterJournalLabel')}
                        <span className='text-xs font-normal text-muted-foreground'>
                          ({journalStats.length})
                        </span>
                      </div>
                      {value.journals.size > 0 && (
                        <button
                          type='button'
                          onClick={() => onChange({ ...value, journals: new Set() })}
                          className='text-xs text-muted-foreground hover:text-foreground'
                        >
                          {t('filterClear')} ({value.journals.size})
                        </button>
                      )}
                    </div>
                    {journalStats.length > 6 && (
                      <Input
                        type='text'
                        value={journalSearch}
                        onChange={(e) => setJournalSearch(e.target.value)}
                        placeholder={t('filterJournalSearch')}
                        aria-label={t('filterJournalSearch')}
                        className='h-9'
                      />
                    )}
                    <div className='flex flex-wrap gap-1.5'>
                      {filteredJournals.map((j: JournalStats) => {
                        const active = value.journals.has(j.name);
                        return (
                          <button
                            key={j.name}
                            type='button'
                            onClick={() => toggleJournal(j.name)}
                            aria-pressed={active}
                            title={j.name}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              active
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                            )}
                          >
                            <span className='max-w-[180px] truncate'>{j.short}</span>
                            <span className='tabular-nums opacity-60'>{j.count}</span>
                          </button>
                        );
                      })}
                      {filteredJournals.length === 0 && (
                        <span className='text-xs text-muted-foreground'>
                          {t('filterJournalNoMatch')}
                        </span>
                      )}
                    </div>
                  </section>
                )}

                {/* Domain — collapsible per axis */}
                <section className='space-y-1'>
                  <div className='flex items-center gap-1.5 text-sm font-medium'>
                    <IconFilter className='size-4 text-muted-foreground' aria-hidden />
                    {t('domainFilterLabel')}
                  </div>
                  {AXIS_GROUPS.map(({ axis, i18nKey, slugs }) => {
                    const visible = visibleDomainSlugs
                      ? slugs.filter((s) => visibleDomainSlugs.has(s))
                      : slugs;
                    if (visible.length === 0) return null;
                    const axisActive = visible.filter((s) => value.domain.selected.has(s)).length;
                    return (
                      <Collapsible key={axis} defaultOpen={axisActive > 0}>
                        <CollapsibleTrigger className='group flex w-full items-center justify-between rounded-md px-1 py-1.5 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground'>
                          <span className='flex items-center gap-2'>
                            {t(i18nKey)}
                            {axisActive > 0 && (
                              <Badge variant='secondary' className='px-1.5 py-0 tabular-nums'>
                                {axisActive}
                              </Badge>
                            )}
                          </span>
                          <IconChevronDown
                            className='size-3.5 transition-transform group-data-[state=open]:rotate-180'
                            aria-hidden
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='pt-1'>
                          <div className='flex flex-wrap gap-1.5 pb-2'>
                            {visible.map((slug) => {
                              const active = value.domain.selected.has(slug);
                              return (
                                <button
                                  key={slug}
                                  type='button'
                                  onClick={() => toggleDomain(slug)}
                                  aria-pressed={active}
                                  className={cn(
                                    'inline-flex items-center rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    active
                                      ? AXIS_COLOR[axis]
                                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                                  )}
                                >
                                  {t(`domain.${slug}`)}
                                </button>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </section>
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {hasAny && (
          <Button
            variant='ghost'
            onClick={clearAll}
            className='text-muted-foreground hover:text-foreground'
          >
            {t('clearAll')}
          </Button>
        )}
      </div>

      {/* ---- Active filter chips ---- */}
      {activeCount > 0 && (
        <div className='flex flex-wrap items-center gap-1.5'>
          {(value.yearMin !== null || value.yearMax !== null) && (
            <Badge variant='secondary' className='gap-1 pr-1'>
              {value.yearMin ?? yearRange?.min}–{value.yearMax ?? yearRange?.max}
              <button
                type='button'
                onClick={clearYear}
                aria-label={t('filterClear')}
                className='rounded-sm hover:bg-foreground/10'
              >
                <IconX className='size-3' aria-hidden />
              </button>
            </Badge>
          )}
          {Array.from(value.journals).map((name) => {
            const short = journalStats.find((j) => j.name === name)?.short ?? name;
            return (
              <Badge key={name} variant='secondary' className='gap-1 pr-1' title={name}>
                <span className='max-w-[160px] truncate'>{short}</span>
                <button
                  type='button'
                  onClick={() => toggleJournal(name)}
                  aria-label={t('filterClear')}
                  className='rounded-sm hover:bg-foreground/10'
                >
                  <IconX className='size-3' aria-hidden />
                </button>
              </Badge>
            );
          })}
          {Array.from(value.domain.selected).map((slug) => {
            const axis = axisOf.get(slug);
            return (
              <span
                key={slug}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                  axis ? AXIS_COLOR[axis] : 'border-border text-muted-foreground'
                )}
              >
                {t(`domain.${slug}`)}
                <button
                  type='button'
                  onClick={() => toggleDomain(slug)}
                  aria-label={t('filterClear')}
                  className='rounded-sm hover:bg-foreground/10'
                >
                  <IconX className='size-3' aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pure predicate — apply PaperFilterValue to a paper. (unchanged) */
export function paperPassesFilter(paper: Paper, filter: PaperFilterValue): boolean {
  if (filter.yearMin !== null && paper.year > 0 && paper.year < filter.yearMin) return false;
  if (filter.yearMax !== null && paper.year > 0 && paper.year > filter.yearMax) return false;

  if (filter.journals.size > 0) {
    if (!paper.journal || !filter.journals.has(paper.journal)) return false;
  }

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
