'use client';
import { IconChevronDown, IconChevronRight, IconLoader2 } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
/**
 * Citations section for paper detail page.
 *
 * Shows:
 *   - Outbound (papers this paper cites) — from citations where sourcePaperId=this
 *   - Inbound (papers that cite this paper) — from citations where targetPaperId=this
 *   - Summary stats from _stats/citations doc
 *   - Filter UI (R166-6b-2): toggle confidence levels + inLibraryOnly
 *
 * R223b: whole section is collapsible (74 citations is long, especially in the
 * narrow right panel of the split reader). Header shows total; expand to reveal
 * filter + cards. Per-list show-more (COLLAPSED_LIMIT) still applies inside.
 *
 * @phase R166-6b-1 base, R166-6b-2 filter, R166-6b-2-hotfix2 hook-order fix
 */
import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useCitationsBySource,
  useCitationsByTargetPaperId,
  usePaperCitationStats
} from '@/lib/firestore/queries/citations';
import { cn } from '@/lib/utils';
import { CitationCard } from './citation-card';
import {
  CitationFilter,
  type CitationFilterValue,
  citationPassesFilter,
  createDefaultFilter
} from './citation-filter';

const COLLAPSED_LIMIT = 5;

// R181-10 @r181-10-applied: stable sort key for citation confidence
const CONFIDENCE_ORDER: Record<string, number> = {
  'doi-exact': 0,
  manual: 1,
  'title-fuzzy': 2,
  unverified: 3
};
function byConfidence(a: { confidence: string }, b: { confidence: string }): number {
  const av = CONFIDENCE_ORDER[a.confidence] ?? 99;
  const bv = CONFIDENCE_ORDER[b.confidence] ?? 99;
  return av - bv;
}

// Outbound = this paper's reference list. Show in document order (number, set by
// the worker) so it reads like the printed references; fall back to confidence
// for entries without a number. References with no number sort last.
function byNumberThenConfidence(
  a: { number?: number; confidence: string },
  b: { number?: number; confidence: string }
): number {
  const an = a.number ?? Number.POSITIVE_INFINITY;
  const bn = b.number ?? Number.POSITIVE_INFINITY;
  if (an !== bn) return an - bn;
  return byConfidence(a, b);
}

export function CitationsSection({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const { stats } = usePaperCitationStats(paperId);
  const { citations: outCitations, loading: outLoading } = useCitationsBySource(paperId);
  const { citations: inCitations, loading: inLoading } = useCitationsByTargetPaperId(paperId);

  const [outExpanded, setOutExpanded] = useState(false);
  const [inExpanded, setInExpanded] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(true); // R223b: whole-section collapse
  // R166-6b-2: filter state — default = all confidences ON, inLibraryOnly OFF
  const [filter, setFilter] = useState<CitationFilterValue>(() => createDefaultFilter());

  // R166-6b-2-hotfix2: hooks (useMemo) MUST be called before any conditional
  // return to obey Rules of Hooks. Move filter application above the
  // hasAnyData early return.
  // R181-10 @r181-10-applied: filter + sort by confidence priority
  //   doi-exact → manual → title-fuzzy → unverified
  const outFiltered = useMemo(
    () =>
      outCitations
        .filter((c) => citationPassesFilter(c, filter))
        .slice()
        .sort(byNumberThenConfidence),
    [outCitations, filter]
  );
  const inFiltered = useMemo(
    () =>
      inCitations
        .filter((c) => citationPassesFilter(c, filter))
        .slice()
        .sort(byConfidence),
    [inCitations, filter]
  );

  // No stats doc + no citations → don't render section at all (paper not yet processed)
  const hasAnyData = stats !== null || outCitations.length > 0 || inCitations.length > 0;

  if (!hasAnyData && !outLoading && !inLoading) {
    return null;
  }

  const outCount = stats?.citationsOutCount ?? outCitations.length;
  const inCount = stats?.citationsInCount ?? inCitations.length;
  const filterActive = filter.confidences.size < 4 || filter.inLibraryOnly;

  const outVisible = outExpanded ? outFiltered : outFiltered.slice(0, COLLAPSED_LIMIT);
  const inVisible = inExpanded ? inFiltered : inFiltered.slice(0, COLLAPSED_LIMIT);

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen} className='space-y-3'>
      <CollapsibleTrigger className='flex w-full items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground'>
        <IconChevronRight
          className={cn('size-3.5 transition-transform', sectionOpen && 'rotate-90')}
          aria-hidden
        />
        {t('citations')}
        <span className='font-normal normal-case'>({outCount + inCount})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        {/* R166-6b-2: filter (applies to both Out + In) */}
        {(outCitations.length > 0 || inCitations.length > 0) && (
          <CitationFilter value={filter} onChange={setFilter} />
        )}

        {/* Outbound — papers this paper cites */}
        <div className='border rounded-lg p-4 space-y-3'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-medium'>
              {t('citationsOutTitle', { count: outCount })}
              {filterActive && outFiltered.length !== outCitations.length && (
                <span className='text-muted-foreground font-normal ml-1'>
                  {t('filteredCount', { count: outFiltered.length })}
                </span>
              )}
            </h3>
          </div>

          {outLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
              <IconLoader2 className='size-4 animate-spin' />
              {t('loadingCitations')}
            </div>
          ) : outCitations.length === 0 ? (
            <div className='text-muted-foreground text-sm py-2'>{t('citationsOutEmpty')}</div>
          ) : outFiltered.length === 0 ? (
            <div className='text-muted-foreground text-sm py-2 flex items-center gap-2'>
              <span>{t('noFilterMatches')}</span>
              <button
                type='button'
                onClick={() => setFilter(createDefaultFilter())}
                className='underline hover:text-foreground'
              >
                {t('clearFilter')}
              </button>
            </div>
          ) : (
            <>
              <div className='space-y-2'>
                {outVisible.map((c) => (
                  <CitationCard key={c.id} citation={c} />
                ))}
              </div>
              {outFiltered.length > COLLAPSED_LIMIT && (
                <button
                  onClick={() => setOutExpanded((v) => !v)}
                  className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
                >
                  {outExpanded ? (
                    <IconChevronDown className='size-3' aria-hidden />
                  ) : (
                    <IconChevronRight className='size-3' aria-hidden />
                  )}
                  {outExpanded
                    ? t('showLess')
                    : t('showAllCitations', { count: outFiltered.length })}
                </button>
              )}
            </>
          )}
        </div>

        {/* Inbound — papers citing this paper */}
        {inCount > 0 && (
          <div className='border rounded-lg p-4 space-y-3'>
            <h3 className='text-sm font-medium'>
              {t('citationsInTitle', { count: inCount })}
              {filterActive && inFiltered.length !== inCitations.length && (
                <span className='text-muted-foreground font-normal ml-1'>
                  {t('filteredCount', { count: inFiltered.length })}
                </span>
              )}
            </h3>

            {inLoading ? (
              <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
                <IconLoader2 className='size-4 animate-spin' />
                {t('loadingCitations')}
              </div>
            ) : inFiltered.length === 0 ? (
              <div className='text-muted-foreground text-sm py-2 flex items-center gap-2'>
                <span>{t('noFilterMatches')}</span>
                <button
                  type='button'
                  onClick={() => setFilter(createDefaultFilter())}
                  className='underline hover:text-foreground'
                >
                  {t('clearFilter')}
                </button>
              </div>
            ) : (
              <>
                <div className='space-y-2'>
                  {inVisible.map((c) => (
                    <CitationCard key={c.id} citation={c} />
                  ))}
                </div>
                {inFiltered.length > COLLAPSED_LIMIT && (
                  <button
                    onClick={() => setInExpanded((v) => !v)}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs',
                      'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {inExpanded ? (
                      <IconChevronDown className='size-3' aria-hidden />
                    ) : (
                      <IconChevronRight className='size-3' aria-hidden />
                    )}
                    {inExpanded
                      ? t('showLess')
                      : t('showAllCitations', { count: inFiltered.length })}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
