'use client';
import {
  IconBookmark,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPaperclip,
  IconPencil,
  IconRefresh
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
import { useCallback, useMemo, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Paper } from '@/types/papers';
import {
  useCitationsBySource,
  useCitationsByTargetPaperId,
  usePaperCitationStats
} from '@/lib/firestore/queries/citations';
import { CitationCard } from './citation-card';
import {
  CitationFilter,
  type CitationFilterValue,
  type PublisherOption,
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

export function CitationsSection({ paperId, paper }: { paperId: string; paper?: Paper | null }) {
  const t = useTranslations('papers');
  const { stats } = usePaperCitationStats(paperId);
  const { citations: outCitations, loading: outLoading } = useCitationsBySource(paperId);
  const { citations: inCitations, loading: inLoading } = useCitationsByTargetPaperId(paperId);

  const [outExpanded, setOutExpanded] = useState(false);
  const [inExpanded, setInExpanded] = useState(false);
  const [jumpRef, setJumpRef] = useState('');
  // R237cp: filter by publisher + Open-Access (replaces the old confidence chips)
  const [filter, setFilter] = useState<CitationFilterValue>(() => createDefaultFilter());

  // R177-2: references with a DOI but no resolved title render as "Untitled".
  const [resolving, setResolving] = useState(false);
  const unresolvedCount = useMemo(
    () => outCitations.filter((c) => Boolean(c.targetDoi) && !c.targetTitle?.trim()).length,
    [outCitations]
  );

  const resolveTitles = useCallback(async () => {
    setResolving(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('no auth');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}/resolve-citations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('resolve_failed');
      const data = (await res.json()) as { attempted: number; resolved: number };
      // Live onSnapshot updates the list; just report the outcome.
      toast.success(t('resolveDone', { resolved: data.resolved, total: data.attempted }));
    } catch {
      toast.error(t('resolveFailed'));
    } finally {
      setResolving(false);
    }
  }, [paperId, t]);

  // R237cn #5: drop the paper's OWN doi from its reference list (a paper does not
  // cite itself — that entry is extraction noise). Then sort in document order.
  const selfDoi = (paper?.doi ?? '').trim().toLowerCase();
  const outSorted = useMemo(() => {
    const sorted = outCitations
      .filter((c) => !selfDoi || (c.targetDoi ?? '').trim().toLowerCase() !== selfDoi)
      .toSorted(byNumberThenConfidence);
    // De-duplicate: reprocessing with a different extraction source can leave a
    // SECOND citation row for the same reference (its generated id changed),
    // which surfaces in the UI as a repeated sequence number. Keep the first
    // (best-sorted) per DOI, else per title. (Root fix belongs in the worker —
    // delete stale citations on reprocess — this just stops the visible dupes.)
    const seen = new Set<string>();
    const deduped: typeof sorted = [];
    for (const c of sorted) {
      const key =
        (c.targetDoi ?? '').trim().toLowerCase() ||
        (c.targetTitle ?? '').trim().toLowerCase() ||
        c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(c);
    }
    return deduped;
  }, [outCitations, selfDoi]);
  const inSorted = useMemo(() => inCitations.slice().sort(byConfidence), [inCitations]);

  // R237cp: distinct publishers across both lists, by frequency, for the filter.
  const publishers = useMemo<PublisherOption[]>(() => {
    const counts = new Map<string, number>();
    for (const c of [...outSorted, ...inSorted]) {
      const p = c.targetPublisher?.trim();
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [outSorted, inSorted]);

  // Only show the filter once enrichment has produced something to filter on
  // (pre-reprocess, no citation has publisher/OA → an empty filter is useless).
  const hasFilterData = useMemo(
    () =>
      publishers.length > 0 ||
      [...outSorted, ...inSorted].some((c) => c.targetIsOpenAccess != null),
    [publishers, outSorted, inSorted]
  );

  const outFiltered = useMemo(
    () => outSorted.filter((c) => citationPassesFilter(c, filter)),
    [outSorted, filter]
  );
  const inFiltered = useMemo(
    () => inSorted.filter((c) => citationPassesFilter(c, filter)),
    [inSorted, filter]
  );

  const jumpToRef = useCallback(() => {
    const n = Number.parseInt(jumpRef, 10);
    if (!Number.isFinite(n)) return;
    if (!outFiltered.some((c) => c.number === n)) return; // not in the current list
    setOutExpanded(true); // make sure it's rendered even if collapsed
    setJumpRef('');
    // Let the expanded list render, then bring the reference into view + flash it.
    setTimeout(() => {
      const el = document.getElementById(`cite-ref-${n}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary');
      setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1600);
    }, 60);
  }, [jumpRef, outFiltered]);

  // No stats doc + no citations → don't render section at all (paper not yet processed)
  const hasAnyData = stats !== null || outCitations.length > 0 || inCitations.length > 0;
  if (!hasAnyData && !outLoading && !inLoading) {
    return null;
  }

  const filterOn = filter.openAccessOnly || filter.publishers.size > 0;
  const outCount = outFiltered.length;
  const inCount = inFiltered.length;
  const outVisible = outExpanded ? outFiltered : outFiltered.slice(0, COLLAPSED_LIMIT);
  const inVisible = inExpanded ? inFiltered : inFiltered.slice(0, COLLAPSED_LIMIT);

  return (
    <div className='space-y-3'>
      {/* This paper's own identity — clearly separated from its references. */}
      {paper && <SelfDoiCard paper={paper} />}
      {paper && <SupplementaryInfo paperId={paperId} paper={paper} />}

      {/* R237cp: publisher + Open-Access filter (only once enrichment populated) */}
      {hasFilterData && (
        <CitationFilter value={filter} onChange={setFilter} publishers={publishers} />
      )}

      {/* Outbound — this paper's reference list */}
      <div className='space-y-2 rounded-lg border p-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='min-w-0'>
            <h3 className='flex items-center gap-1.5 text-sm font-medium'>
              <IconBookmark className='size-3.5 text-muted-foreground' aria-hidden />
              {t('referencesTitle')}
            </h3>
            <p className='mt-0.5 pl-[1.375rem] text-xs font-normal text-muted-foreground'>
              {filterOn && outFiltered.length !== outSorted.length
                ? t('referencesShownOfTotal', {
                    shown: outFiltered.length,
                    total: outSorted.length
                  })
                : t('referencesSubcount', { count: outSorted.length })}
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-3'>
            {outSorted.length > COLLAPSED_LIMIT && (
              <input
                type='number'
                inputMode='numeric'
                value={jumpRef}
                onChange={(e) => setJumpRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    jumpToRef();
                  }
                }}
                placeholder='#'
                aria-label='Nhảy tới tài liệu tham khảo theo số'
                title='Nhập số thứ tự TLTK rồi Enter để nhảy tới'
                className='h-6 w-12 rounded border border-input bg-transparent px-1.5 text-xs tabular-nums outline-none focus:border-primary'
              />
            )}
            {unresolvedCount > 0 && !outLoading && (
              <button
                type='button'
                onClick={resolveTitles}
                disabled={resolving}
                className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50'
              >
                {resolving ? (
                  <IconLoader2 className='size-3 animate-spin' aria-hidden />
                ) : (
                  <IconRefresh className='size-3' aria-hidden />
                )}
                {resolving ? t('resolving') : t('resolveTitlesCount', { count: unresolvedCount })}
              </button>
            )}
            {outFiltered.length > COLLAPSED_LIMIT && (
              <button
                type='button'
                onClick={() => setOutExpanded((v) => !v)}
                className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                {outExpanded ? (
                  <IconChevronDown className='size-3' aria-hidden />
                ) : (
                  <IconChevronRight className='size-3' aria-hidden />
                )}
                {outExpanded ? t('showLess') : t('showAllCitations', { count: outFiltered.length })}
              </button>
            )}
          </div>
        </div>

        {outLoading ? (
          <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
            <IconLoader2 className='size-4 animate-spin' />
            {t('loadingCitations')}
          </div>
        ) : outSorted.length === 0 ? (
          <div className='text-muted-foreground text-sm py-2'>{t('citationsOutEmpty')}</div>
        ) : outCount === 0 ? (
          <div className='flex items-center gap-2 py-2 text-muted-foreground text-sm'>
            <span>{t('filterNoMatches')}</span>
            <button
              type='button'
              onClick={() => setFilter(createDefaultFilter())}
              className='underline hover:text-foreground'
            >
              {t('filterClear')}
            </button>
          </div>
        ) : (
          <div className='space-y-1.5'>
            {outVisible.map((c) => (
              <div
                key={c.id}
                id={c.number !== undefined ? `cite-ref-${c.number}` : undefined}
                className='rounded-lg transition-shadow'
              >
                <CitationCard citation={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inbound — papers citing this paper */}
      {inSorted.length > 0 && (
        <div className='space-y-2 rounded-lg border p-4'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-sm font-medium'>
              {t('citationsInTitle', { count: inSorted.length })}
              {filterOn && inFiltered.length !== inSorted.length && (
                <span className='ml-1 font-normal text-muted-foreground'>
                  {t('filteredCount', { count: inFiltered.length })}
                </span>
              )}
            </h3>
            {inFiltered.length > COLLAPSED_LIMIT && (
              <button
                type='button'
                onClick={() => setInExpanded((v) => !v)}
                className='inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                {inExpanded ? (
                  <IconChevronDown className='size-3' aria-hidden />
                ) : (
                  <IconChevronRight className='size-3' aria-hidden />
                )}
                {inExpanded ? t('showLess') : t('showAllCitations', { count: inFiltered.length })}
              </button>
            )}
          </div>

          {inLoading ? (
            <div className='flex items-center gap-2 text-muted-foreground text-sm py-2'>
              <IconLoader2 className='size-4 animate-spin' />
              {t('loadingCitations')}
            </div>
          ) : inCount === 0 ? (
            <div className='flex items-center gap-2 py-2 text-muted-foreground text-sm'>
              <span>{t('filterNoMatches')}</span>
              <button
                type='button'
                onClick={() => setFilter(createDefaultFilter())}
                className='underline hover:text-foreground'
              >
                {t('filterClear')}
              </button>
            </div>
          ) : (
            <div className='space-y-1.5'>
              {inVisible.map((c) => (
                <CitationCard key={c.id} citation={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The paper's OWN DOI — visually distinct (accent card) so it's never mistaken
 *  for one of its references. */
function SelfDoiCard({ paper }: { paper: Paper }) {
  const t = useTranslations('papers');
  const [copied, setCopied] = useState(false);
  const doi = paper.doi?.trim();
  const handleCopy = useCallback(() => {
    if (!doi) return;
    void navigator.clipboard.writeText(doi);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [doi]);

  return (
    <div className='rounded-lg border border-primary/30 bg-primary/5 p-3'>
      <div className='mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-primary'>
        <IconBookmark className='size-3.5' aria-hidden />
        {t('thisPaperDoi')}
      </div>
      {doi ? (
        <div className='flex items-center gap-2'>
          <a
            href={`https://doi.org/${doi}`}
            target='_blank'
            rel='noopener noreferrer'
            className='min-w-0 flex-1 truncate font-mono text-xs text-foreground hover:underline'
          >
            {doi}
          </a>
          <button
            type='button'
            onClick={handleCopy}
            title={t('copy')}
            aria-label={t('copy')}
            className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            {copied ? (
              <IconCheck className='size-3.5 text-primary' />
            ) : (
              <IconCopy className='size-3.5' />
            )}
          </button>
          <a
            href={`https://doi.org/${doi}`}
            target='_blank'
            rel='noopener noreferrer'
            title={t('openDoiNewTab')}
            aria-label={t('openDoiNewTab')}
            className='shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            <IconExternalLink className='size-3.5' />
          </a>
        </div>
      ) : (
        <div className='text-xs text-muted-foreground'>{t('noDoiForPaper')}</div>
      )}
    </div>
  );
}

/** Supplementary Information slot. SI files live on the publisher site and are
 *  not reliably in any API, so the link is user-provided (saved to paper.siUrl
 *  via PATCH). May later be auto-filled best-effort from Crossref relation. */
function SupplementaryInfo({ paperId, paper }: { paperId: string; paper: Paper }) {
  const t = useTranslations('papers');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const stored = savedUrl !== null ? savedUrl : (paper.siUrl ?? '');
  const current = stored.trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const save = useCallback(async () => {
    const next = draft.trim();
    setSaving(true);
    setError(false);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('no auth');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siUrl: next })
      });
      if (!res.ok) throw new Error('patch_failed');
      setSavedUrl(next);
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [draft, paperId]);

  const startEdit = useCallback(() => {
    setDraft(current);
    setEditing(true);
  }, [current]);

  return (
    <div className='rounded-lg border p-3'>
      <div className='mb-1.5 flex items-center justify-between'>
        <div className='flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground'>
          <IconPaperclip className='size-3.5' aria-hidden />
          {t('supplementaryInfo')}
        </div>
        {current && !editing && (
          <button
            type='button'
            onClick={startEdit}
            className='inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground'
          >
            <IconPencil className='size-3' aria-hidden />
            {t('edit')}
          </button>
        )}
      </div>

      {current && !editing ? (
        <a
          href={current}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1.5 break-all text-xs text-primary hover:underline'
        >
          <IconExternalLink className='size-3.5 shrink-0' aria-hidden />
          {t('openSupplementary')}
        </a>
      ) : (
        <div className='space-y-1.5'>
          <input
            type='url'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('supplementaryPlaceholder')}
            aria-label={t('supplementaryInfo')}
            className='w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary'
          />
          <div className='flex items-center gap-2'>
            <button
              type='button'
              disabled={saving}
              onClick={save}
              className='rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
            >
              {saving ? t('saving') : t('save')}
            </button>
            {(current || editing) && (
              <button
                type='button'
                onClick={() => {
                  setEditing(false);
                  setDraft(current);
                }}
                className='text-[11px] text-muted-foreground hover:text-foreground'
              >
                {t('cancel')}
              </button>
            )}
            {error && <span className='text-[11px] text-destructive'>{t('saveFailed')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
