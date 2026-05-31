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
  IconCategory2,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFilter,
  IconMinus,
  IconSearch,
  IconTags,
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
  aggregateDomainCounts,
  aggregateJournalStats,
  aggregateOpenAlexTree,
  aggregatePublisherTree,
  aggregateYearRange,
  type JournalStats,
  type OpenAlexFieldGroup,
  type PublisherGroup
} from '@/features/papers/lib/journal-stats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  /** R237cb: selected OpenAlex subfields (field rows toggle their subfields). */
  openalexSubfields: Set<string>;
  yearMin: number | null;
  yearMax: number | null;
  titleQuery: string;
}

export function createEmptyPaperFilter(): PaperFilterValue {
  return {
    domain: createEmptyDomainFilter(),
    journals: new Set(),
    openalexSubfields: new Set(),
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
  const [expandedPubs, setExpandedPubs] = useState<Set<string>>(() => new Set()); // R237by
  const [oaSearch, setOaSearch] = useState(''); // R237cb
  const [expandedFields, setExpandedFields] = useState<Set<string>>(() => new Set()); // R237cb

  const journalStats = useMemo(() => aggregateJournalStats(papers), [papers]);
  const yearRange = useMemo(() => aggregateYearRange(papers), [papers]);
  // R237by: publisher → journals tree, filtered by the journal search box.
  const publisherTree = useMemo(() => {
    const tree = aggregatePublisherTree(papers);
    const q = journalSearch.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((g) => ({
        ...g,
        journals: g.journals.filter(
          (j) =>
            j.name.toLowerCase().includes(q) ||
            j.short.toLowerCase().includes(q) ||
            g.publisher.toLowerCase().includes(q)
        )
      }))
      .filter((g) => g.journals.length > 0);
  }, [papers, journalSearch]);
  // R237cb: OpenAlex field → subfields tree, filtered by its own search box.
  const oaTree = useMemo(() => {
    const tree = aggregateOpenAlexTree(papers);
    const q = oaSearch.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((g) => ({
        ...g,
        subfields: g.subfields.filter(
          (s) => s.name.toLowerCase().includes(q) || g.field.toLowerCase().includes(q)
        )
      }))
      .filter((g) => g.subfields.length > 0);
  }, [papers, oaSearch]);
  const isOaSearching = oaSearch.trim().length > 0;
  const domainCounts = useMemo(() => aggregateDomainCounts(papers), [papers]); // R229
  const currentYear = new Date().getFullYear(); // R229 year presets

  // R229: live count of papers matching the CURRENT filter, shown so the user
  // sees the impact before closing the popover. Recomputed only when filter or
  // papers change.
  const matchedCount = useMemo(
    () => papers.reduce((n, p) => (paperPassesFilter(p, value) ? n + 1 : n), 0),
    [papers, value]
  );

  const isJournalSearching = journalSearch.trim().length > 0;

  // ---- counts ----
  const activeCount =
    value.domain.selected.size +
    value.journals.size +
    value.openalexSubfields.size +
    (value.yearMin !== null || value.yearMax !== null ? 1 : 0);

  const hasAny = activeCount > 0 || value.titleQuery.trim().length > 0;

  // ---- mutators ----
  function toggleJournal(name: string): void {
    const next = new Set(value.journals);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...value, journals: next });
  }

  // R237by: ticking a publisher selects/deselects all its journals at once.
  function togglePublisher(group: PublisherGroup): void {
    const names = group.journals.map((j) => j.name);
    const allSelected = names.every((n) => value.journals.has(n));
    const next = new Set(value.journals);
    if (allSelected) for (const n of names) next.delete(n);
    else for (const n of names) next.add(n);
    onChange({ ...value, journals: next });
  }

  function togglePubExpand(publisher: string): void {
    setExpandedPubs((prev) => {
      const next = new Set(prev);
      if (next.has(publisher)) next.delete(publisher);
      else next.add(publisher);
      return next;
    });
  }

  // R237cb: OpenAlex field/subfield mutators (mirror the publisher tree).
  function toggleSubfield(name: string): void {
    const next = new Set(value.openalexSubfields);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...value, openalexSubfields: next });
  }

  function toggleField(group: OpenAlexFieldGroup): void {
    const names = group.subfields.map((s) => s.name);
    const allSelected = names.every((n) => value.openalexSubfields.has(n));
    const next = new Set(value.openalexSubfields);
    if (allSelected) for (const n of names) next.delete(n);
    else for (const n of names) next.add(n);
    onChange({ ...value, openalexSubfields: next });
  }

  function toggleFieldExpand(field: string): void {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
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
    setOaSearch('');
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
          <PopoverContent
            align='end'
            collisionPadding={16}
            className='w-[clamp(20rem,90vw,26rem)] overflow-hidden p-0'
          >
            <div className='max-h-[min(75vh,36rem)] overflow-y-auto'>
              <div className='space-y-4 p-4'>
                {/* R222b: panel header — Clear all lives here (not on the outer
                    bar) so the bar stays fixed = no layout shift. Disabled when
                    nothing is active; it's inside the popover so toggling its
                    state never reflows the page. */}
                <div className='flex items-center justify-between border-b pb-2'>
                  <div className='flex items-center gap-1.5 text-sm font-medium'>
                    <IconFilter className='size-4 text-muted-foreground' aria-hidden />
                    {t('filtersButton')}
                    {/* R229: live matched count so the impact is visible here */}
                    <span className='text-xs font-normal text-muted-foreground tabular-nums'>
                      {t('filterMatchedCount', { matched: matchedCount, total: papers.length })}
                    </span>
                  </div>
                  <button
                    type='button'
                    onClick={clearAll}
                    disabled={!hasAny}
                    className='text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground'
                  >
                    {t('clearAll')}
                  </button>
                </div>
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
                    {/* R229: quick presets — last N years up to now. */}
                    <div className='flex flex-wrap gap-1.5'>
                      {[3, 5, 10].map((n) => {
                        const from = currentYear - n + 1;
                        const presetActive = value.yearMin === from && value.yearMax === null;
                        return (
                          <button
                            key={n}
                            type='button'
                            onClick={() =>
                              presetActive
                                ? clearYear()
                                : onChange({ ...value, yearMin: from, yearMax: null })
                            }
                            aria-pressed={presetActive}
                            className={cn(
                              'rounded-md px-2 py-1 text-xs transition-colors',
                              presetActive
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            {t('filterYearLastN', { count: n })}
                          </button>
                        );
                      })}
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
                    <div className='space-y-1'>
                      {publisherTree.map((group: PublisherGroup) => {
                        const names = group.journals.map((j) => j.name);
                        const selectedCount = names.filter((n) => value.journals.has(n)).length;
                        const allSelected = selectedCount === names.length && names.length > 0;
                        const someSelected = selectedCount > 0 && !allSelected;
                        // Force-open while searching so matches are visible.
                        const open = isJournalSearching || expandedPubs.has(group.publisher);
                        const label = group.publisher || t('filterPublisherUnknown');
                        return (
                          <div key={group.publisher || '__none__'} className='rounded-md border'>
                            <div className='flex items-center gap-1.5 px-1.5 py-1'>
                              <button
                                type='button'
                                onClick={() => togglePublisher(group)}
                                aria-pressed={allSelected}
                                title={label}
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  allSelected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : someSelected
                                      ? 'border-primary bg-primary/30 text-primary'
                                      : 'border-input hover:border-primary'
                                )}
                              >
                                {allSelected ? (
                                  <IconCheck className='size-3' aria-hidden />
                                ) : someSelected ? (
                                  <IconMinus className='size-3' aria-hidden />
                                ) : null}
                              </button>
                              <button
                                type='button'
                                onClick={() => togglePubExpand(group.publisher)}
                                className='flex min-w-0 flex-1 items-center gap-1.5 text-left'
                              >
                                <IconChevronRight
                                  className={cn(
                                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                                    open && 'rotate-90'
                                  )}
                                  aria-hidden
                                />
                                <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                                  {label}
                                </span>
                                <span className='shrink-0 text-[10.5px] tabular-nums text-muted-foreground'>
                                  {group.journals.length} · {group.count}
                                </span>
                              </button>
                            </div>
                            {open && (
                              <div className='flex flex-wrap gap-1.5 border-t px-2 py-1.5'>
                                {group.journals.map((j: JournalStats) => {
                                  const active = value.journals.has(j.name);
                                  return (
                                    <button
                                      key={j.name}
                                      type='button'
                                      onClick={() => toggleJournal(j.name)}
                                      aria-pressed={active}
                                      title={j.name}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        active
                                          ? 'bg-primary/10 text-primary'
                                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                      )}
                                    >
                                      <span className='max-w-[180px] truncate'>{j.short}</span>
                                      <span className='tabular-nums opacity-60'>{j.count}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {publisherTree.length === 0 && (
                        <span className='text-xs text-muted-foreground'>
                          {t('filterJournalNoMatch')}
                        </span>
                      )}
                    </div>
                  </section>
                )}

                {/* OpenAlex field → subfields (R237cb) — authoritative axis. */}
                {oaTree.length > 0 && (
                  <section className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-1.5 text-sm font-medium'>
                        <IconCategory2
                          className='size-4 text-sky-600 dark:text-sky-400'
                          aria-hidden
                        />
                        {t('filterOpenAlexLabel')}
                        <span className='text-xs font-normal text-muted-foreground'>
                          ({oaTree.length})
                        </span>
                      </div>
                      {value.openalexSubfields.size > 0 && (
                        <button
                          type='button'
                          onClick={() => onChange({ ...value, openalexSubfields: new Set() })}
                          className='text-xs text-muted-foreground hover:text-foreground'
                        >
                          {t('filterClear')} ({value.openalexSubfields.size})
                        </button>
                      )}
                    </div>
                    {oaTree.length > 6 && (
                      <Input
                        type='text'
                        value={oaSearch}
                        onChange={(e) => setOaSearch(e.target.value)}
                        placeholder={t('filterOpenAlexSearch')}
                        aria-label={t('filterOpenAlexSearch')}
                        className='h-9'
                      />
                    )}
                    <div className='space-y-1'>
                      {oaTree.map((group: OpenAlexFieldGroup) => {
                        const names = group.subfields.map((s) => s.name);
                        const selectedCount = names.filter((n) =>
                          value.openalexSubfields.has(n)
                        ).length;
                        const allSelected = selectedCount === names.length && names.length > 0;
                        const someSelected = selectedCount > 0 && !allSelected;
                        const open = isOaSearching || expandedFields.has(group.field);
                        return (
                          <div key={group.field} className='rounded-md border'>
                            <div className='flex items-center gap-1.5 px-1.5 py-1'>
                              <button
                                type='button'
                                onClick={() => toggleField(group)}
                                aria-pressed={allSelected}
                                title={group.field}
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  allSelected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : someSelected
                                      ? 'border-primary bg-primary/30 text-primary'
                                      : 'border-input hover:border-primary'
                                )}
                              >
                                {allSelected ? (
                                  <IconCheck className='size-3' aria-hidden />
                                ) : someSelected ? (
                                  <IconMinus className='size-3' aria-hidden />
                                ) : null}
                              </button>
                              <button
                                type='button'
                                onClick={() => toggleFieldExpand(group.field)}
                                className='flex min-w-0 flex-1 items-center gap-1.5 text-left'
                              >
                                <IconChevronRight
                                  className={cn(
                                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                                    open && 'rotate-90'
                                  )}
                                  aria-hidden
                                />
                                <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                                  {group.field}
                                </span>
                                <span className='shrink-0 text-[10.5px] tabular-nums text-muted-foreground'>
                                  {group.subfields.length} · {group.count}
                                </span>
                              </button>
                            </div>
                            {open && (
                              <div className='flex flex-wrap gap-1.5 border-t px-2 py-1.5'>
                                {group.subfields.map((s) => {
                                  const active = value.openalexSubfields.has(s.name);
                                  return (
                                    <button
                                      key={s.name}
                                      type='button'
                                      onClick={() => toggleSubfield(s.name)}
                                      aria-pressed={active}
                                      title={s.name}
                                      className={cn(
                                        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        active
                                          ? 'bg-primary/10 text-primary'
                                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                      )}
                                    >
                                      <span className='max-w-[180px] truncate'>{s.name}</span>
                                      <span className='tabular-nums opacity-60'>{s.count}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Domain — collapsible per axis */}
                <section className='space-y-1'>
                  <div className='flex items-center gap-1.5 text-sm font-medium'>
                    <IconTags className='size-4 text-muted-foreground' aria-hidden />
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
                              const count = domainCounts.get(slug) ?? 0;
                              return (
                                <button
                                  key={slug}
                                  type='button'
                                  onClick={() => toggleDomain(slug)}
                                  aria-pressed={active}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    active
                                      ? AXIS_COLOR[axis]
                                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                  )}
                                >
                                  {t(`domain.${slug}`)}
                                  {count > 0 && (
                                    <span className='tabular-nums opacity-60'>{count}</span>
                                  )}
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
            </div>
          </PopoverContent>
        </Popover>
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
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  axis ? AXIS_COLOR[axis] : 'bg-muted text-muted-foreground'
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

  if (filter.openalexSubfields.size > 0) {
    const sub = (paper.openalexSubfield ?? '').trim() || '—';
    if (!paper.openalexField || !filter.openalexSubfields.has(sub)) return false;
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
