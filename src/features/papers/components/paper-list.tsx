'use client';

// R166-ai6a-3b-fix2: + extracting_citations
// R178-3: + domain filter chips
// @r178-3-applied
// @r179-2-hotfix1-applied — full filter panel (year + journal + domain)
// R222: research-first card redesign — authors/year/journal over chunks/MB,
//   domain chip click-to-filter, conditional status badge, sort + density toggle.

import {
  IconArrowsSort,
  IconAlertTriangle,
  IconExternalLink,
  IconFileText,
  IconLayoutList,
  IconLayoutRows,
  IconLoader2,
  IconUpload
} from '@tabler/icons-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  createEmptyPaperFilter,
  type PaperFilterValue,
  PaperFilterPanel,
  paperPassesFilter
} from '@/features/papers/components/paper-filter-panel';
import { PaperJournalInfoCard } from '@/features/papers/components/paper-journal-info-card';
import { UploadSheet } from '@/features/papers/components/upload-sheet';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { PaperMetadataEditor } from '@/features/papers/components/paper-metadata-editor';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { toast } from 'sonner';
import { aggregateJournalStats } from '@/features/papers/lib/journal-stats';
import { PaperOpenAlexBadge } from '@/features/papers/components/paper-openalex-badge';
import { AXIS_COLOR, getAxis } from '@/features/papers/lib/taxonomy';
import { searchPapers } from '@/features/papers/lib/title-search';
import { formatSciText } from '@/features/spectra/utils/format-units';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { usePapers } from '@/lib/firestore/queries/papers';
import { cn } from '@/lib/utils';
import { type Paper, type PaperStatus, TERMINAL_STATUSES } from '@/types/papers';

// R222: only surface the status badge when it carries signal. 'indexed' is the
// default expected state — showing it on 100% of cards is pure noise, so it is
// intentionally absent here. Failed/processing/cancelled DO need attention.
const STATUS_BADGE: Partial<Record<PaperStatus, string>> = {
  queued: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  ocr: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  chunking: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  enriching: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  embedding: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  indexing: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  extracting_citations: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  failed: 'bg-destructive/10 text-destructive',
  cancelling: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  cancelled: 'bg-muted text-muted-foreground'
  // 'indexed' deliberately omitted — see comment above.
};

type FirestoreTimestampLike =
  | number
  | {
      _seconds?: number;
      _nanoseconds?: number;
      seconds?: number;
      nanoseconds?: number;
      toMillis?: () => number;
    };

function toEpochMs(value: FirestoreTimestampLike | undefined | null): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const sec = value._seconds ?? value.seconds ?? 0;
  const nano = value._nanoseconds ?? value.nanoseconds ?? 0;
  return sec * 1000 + Math.floor(nano / 1_000_000);
}

type SortKey = 'recent' | 'year_desc' | 'title_asc' | 'domain';
type ViewMode = 'compact' | 'comfortable';

/** Format the author line the way researchers recognize papers: "Zhang et al." */
function formatAuthors(authors: string[] | undefined): string | null {
  if (!authors || authors.length === 0) return null;
  const first = authors[0]?.trim();
  if (!first) return null;
  return authors.length > 1 ? `${first} et al.` : first;
}

export function PaperList() {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const { papers, loading } = usePapers();
  const [filter, setFilter] = useState<PaperFilterValue>(() => createEmptyPaperFilter());
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>('compact'); // R222 #1: compact default → 15-20/screen

  const visibleSlugs = useMemo(() => {
    const s = new Set<string>();
    for (const p of papers) {
      if (p.domain) s.add(p.domain);
      if (p.subtopics) {
        for (const slug of p.subtopics) s.add(slug);
      }
    }
    return s;
  }, [papers]);

  const filteredPapers = useMemo(() => {
    // R179-7c: fuzzy title search BEFORE field filters (intersection)
    const titleMatched = filter.titleQuery ? searchPapers(papers, filter.titleQuery) : papers;
    const passed = titleMatched.filter((p) => paperPassesFilter(p, filter));
    // R222: client-side sort (data already in memory; no extra query).
    const sorted = [...passed];
    switch (sort) {
      case 'year_desc':
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'title_asc':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'domain':
        sorted.sort((a, b) => (a.domain || 'zzz').localeCompare(b.domain || 'zzz'));
        break;
      default:
        sorted.sort((a, b) => toEpochMs(b.uploadedAt) - toEpochMs(a.uploadedAt));
        break;
    }
    return sorted;
  }, [papers, filter, sort]);

  if (loading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <IconLoader2 className='size-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className='text-center py-12 space-y-3'>
        <IconFileText className='size-12 text-muted-foreground/40 mx-auto' />
        <div className='space-y-1'>
          <p className='font-medium'>{t('noPapersYet')}</p>
          <p className='text-muted-foreground text-sm'>{t('uploadToStart')}</p>
        </div>
        <UploadSheet
          trigger={
            <Button className='inline-flex items-center gap-2'>
              <IconUpload className='size-4' />
              {t('uploadFirstPaper')}
            </Button>
          }
        />
      </div>
    );
  }

  const hasFilter =
    filter.domain.selected.size > 0 ||
    filter.journals.size > 0 ||
    filter.yearMin !== null ||
    filter.yearMax !== null ||
    filter.titleQuery.trim().length > 0;

  const SORT_LABELS: Record<SortKey, string> = {
    recent: t('sortRecent'),
    year_desc: t('sortYear'),
    title_asc: t('sortTitle'),
    domain: t('sortDomain')
  };

  /** R222 #4: clicking a domain chip toggles it into the domain filter. */
  const toggleDomainFilter = (slug: string) => {
    setFilter((prev) => {
      const selected = new Set(prev.domain.selected);
      if (selected.has(slug)) selected.delete(slug);
      else selected.add(slug);
      return { ...prev, domain: { ...prev.domain, selected } };
    });
  };

  return (
    <div className='space-y-3'>
      <PaperFilterPanel
        value={filter}
        onChange={setFilter}
        papers={papers}
        visibleDomainSlugs={visibleSlugs}
      />

      {/* R222: toolbar — sort + density toggle */}
      <div className='flex items-center justify-between gap-2'>
        <p className='text-xs text-muted-foreground'>
          {hasFilter
            ? t('filterShowing', { shown: filteredPapers.length, total: papers.length })
            : t('paperCount', { count: papers.length })}
        </p>
        <div className='flex items-center gap-1.5'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/50'
              >
                <IconArrowsSort className='size-3.5' />
                {SORT_LABELS[sort]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)}>
                  {SORT_LABELS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* R223c: only 2 modes → single toggle button (1 click) instead of a
              dropdown (2 clicks). Icon shows the mode you'll switch TO. */}
          <button
            type='button'
            onClick={() => setView((v) => (v === 'compact' ? 'comfortable' : 'compact'))}
            aria-label={view === 'compact' ? t('viewComfortable') : t('viewCompact')}
            title={view === 'compact' ? t('viewComfortable') : t('viewCompact')}
            className='inline-flex items-center rounded-md border p-1.5 hover:bg-muted/50'
          >
            {view === 'compact' ? (
              <IconLayoutRows className='size-3.5' />
            ) : (
              <IconLayoutList className='size-3.5' />
            )}
          </button>
        </div>
      </div>

      {/* @r179-2-hotfix1-applied: show info card when filter narrowed to 1 journal */}
      {filter.journals.size === 1 &&
        (() => {
          const journalName = Array.from(filter.journals)[0];
          const stats = aggregateJournalStats(papers).find((s) => s.name === journalName);
          return stats ? <PaperJournalInfoCard stats={stats} /> : null;
        })()}

      {filteredPapers.length === 0 ? (
        <p className='text-center py-8 text-sm text-muted-foreground'>{t('filterNoMatches')}</p>
      ) : (
        <div className={cn(view === 'comfortable' ? 'space-y-2' : 'divide-y rounded-lg border')}>
          {filteredPapers.map((paper) => (
            <PaperRow
              key={paper.id}
              paper={paper}
              locale={locale}
              view={view}
              onDomainClick={toggleDomainFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaperRow({
  paper,
  locale,
  view,
  onDomainClick
}: {
  paper: Paper;
  locale: string;
  view: ViewMode;
  onDomainClick: (slug: string) => void;
}) {
  const t = useTranslations('papers');
  const router = useRouter();
  const openTab = usePaperTabsStore((s) => s.openTab);
  const isOpenInTab = usePaperTabsStore((s) => s.tabs.some((tab) => tab.paperId === paper.id));
  const [editOpen, setEditOpen] = useState(false);
  const authorLine = formatAuthors(paper.authors);
  const journal = paper.journalShort || paper.journal || null;
  const badgeClass = STATUS_BADGE[paper.status];
  const domainAxis = paper.domain ? getAxis(paper.domain) : null;
  const href = `/${locale}/dashboard/papers/${paper.id}`;
  const isCard = view === 'comfortable';
  const isCompact = view === 'compact';

  // R222 #2/#3: research metadata (authors · year · journal) replaces the
  // RAG-internal metadata (chunks/MB). A researcher recognizes a paper by
  // "Zhang et al. 2024, Nature" — not by "24 chunks, 7.2 MB".
  const metaParts: string[] = [];
  if (authorLine) metaParts.push(authorLine);
  if (paper.year) metaParts.push(String(paper.year));
  if (journal) metaParts.push(journal);

  // R222b: the row is NOT a <Link> wrapper — it would nest the DOI <a> inside an
  // anchor (invalid HTML, hydration warnings, unpredictable clicks). Instead the
  // row navigates via router on click, the title is a real <Link> (keyboard +
  // middle-click open-in-new-tab), and DOI is a standalone external <a>.
  const goToDetail = () => {
    openTab(paper.id, paper.title || undefined);
    router.push(href);
  };

  return (
    <div
      role='link'
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToDetail();
        }
      }}
      aria-label={paper.title || t('untitled')}
      className={cn(
        'group block cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isCard ? 'rounded-lg border p-4' : 'px-4 py-2.5'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 flex-1'>
          <h3 className={cn('truncate font-medium', isCompact ? 'text-sm' : 'text-base')}>
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className='hover:underline focus-visible:underline focus-visible:outline-none'
            >
              {paper.title ? formatSciText(paper.title) : t('untitled')}
            </Link>
            {/* R227c: subtle "open in a tab" marker so the user knows this paper
                already has a reading session (clicking returns to it). */}
            {isOpenInTab && (
              <span
                className='ml-2 inline-flex items-center gap-1 align-middle rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'
                title={t('openInTab')}
              >
                <span className='size-1.5 rounded-full bg-primary' aria-hidden />
                {t('openInTab')}
              </span>
            )}
          </h3>
          <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
            {metaParts.length > 0 ? (
              <span className='truncate'>{metaParts.join(' · ')}</span>
            ) : (
              <button
                type='button'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditOpen(true);
                }}
                className='inline-flex cursor-pointer items-center gap-1 rounded text-xs italic text-amber-600 underline-offset-2 hover:underline dark:text-amber-500'
              >
                {t('metadataPending')} · {t('metadataAdd')}
              </button>
            )}
            {/* R222b: DOI link (Cách A) — opens publisher in a new tab. stopPropagation
                so clicking DOI does NOT also open the in-app paper detail. The
                external-link icon + "DOI" text make it explicit this leaves the app. */}
            {paper.doi && (
              <>
                <span aria-hidden>·</span>
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={(e) => e.stopPropagation()}
                  className='inline-flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
                  aria-label={`DOI: ${paper.doi}`}
                >
                  DOI
                  <IconExternalLink className='size-3' aria-hidden />
                </a>
                {paper.doiVerified === false && (
                  <IconAlertTriangle
                    className='size-3 text-amber-600 dark:text-amber-400'
                    title={t('doiUnverified')}
                  />
                )}
              </>
            )}
            {/* R237ca: OpenAlex field — authoritative classification, shown
                before the Gemini domain chip (option B: OpenAlex is primary). */}
            {paper.openalexField && (
              <PaperOpenAlexBadge
                field={paper.openalexField}
                subfield={paper.openalexSubfield}
                topic={paper.openalexTopic}
                score={paper.openalexTopicScore}
                variant='compact'
              />
            )}
            {/* R222 #4: domain as a clickable color chip, not grey tail text. */}
            {paper.domain && paper.domain !== 'unknown' && domainAxis && (
              <button
                type='button'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDomainClick(paper.domain!);
                }}
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium leading-none transition-opacity hover:opacity-80',
                  AXIS_COLOR[domainAxis]
                )}
              >
                {t(`domain.${paper.domain}`)}
              </button>
            )}
          </div>
        </div>
        {/* R222 #5: status badge only when it carries signal (not 'indexed'). */}
        <div className='flex shrink-0 items-center gap-1'>
          {badgeClass && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                badgeClass
              )}
            >
              {t(`status.${paper.status}`)}
            </span>
          )}
          <PaperRowMenu
            paperId={paper.id}
            status={paper.status}
            onEditMetadata={() => setEditOpen(true)}
          />
        </div>
      </div>
      <PaperMetadataEditor
        paper={editOpen ? paper : null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}

/**
 * PaperRowMenu (R237az) — per-row kebab (3-dot) with Reprocess + Archive.
 * Moves these out of the (now hidden in reader) detail header into the list,
 * using the stack DropdownMenu. stopPropagation everywhere so opening the menu
 * or picking an item never also opens the paper. Archive = remove from list
 * (soft, restorable); reprocess only offered for terminal statuses.
 */
async function paperAuthHeader(): Promise<{ Authorization: string }> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

function PaperRowMenu({
  paperId,
  status,
  onEditMetadata
}: {
  paperId: string;
  status: PaperStatus;
  onEditMetadata: () => void;
}) {
  const t = useTranslations('papers');
  const [busy, setBusy] = useState(false);
  const canReprocess = TERMINAL_STATUSES.has(status);

  const reprocess = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/papers/${paperId}/reprocess`, {
        method: 'POST',
        headers: await paperAuthHeader()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t('reprocessStarted'));
    } catch (e) {
      toast.error(t('reprocessFailed'), {
        description: e instanceof Error ? e.message : 'unknown'
      });
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!confirm(t('archiveConfirm'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/papers/${paperId}?reason=manual_archive`, {
        method: 'DELETE',
        headers: await paperAuthHeader()
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      toast.success(t('archiveSuccess'));
    } catch (e) {
      toast.error(t('archiveFailed'), { description: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100'
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={t('moreActions')}
        >
          <Icons.ellipsis className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            onEditMetadata();
          }}
        >
          <Icons.edit className='size-4' />
          {t('metadataEdit')}
        </DropdownMenuItem>
        {canReprocess && (
          <DropdownMenuItem
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void reprocess();
            }}
          >
            <Icons.refresh className='size-4' />
            {t('reprocess')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            void archive();
          }}
          className='text-destructive focus:text-destructive'
        >
          <Icons.trash className='size-4' />
          {t('archive')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
