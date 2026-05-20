'use client';

// R166-ai6a-3b-fix2: + extracting_citations
// R178-3: + domain filter chips
// @r178-3-applied
// @r179-2-hotfix1-applied — full filter panel (year + journal + domain)

import { IconFileText, IconLoader2, IconUpload } from '@tabler/icons-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  createEmptyPaperFilter,
  type PaperFilterValue,
  PaperFilterPanel,
  paperPassesFilter
} from '@/features/papers/components/paper-filter-panel';
import { PaperJournalInfoCard } from '@/features/papers/components/paper-journal-info-card';
import { aggregateJournalStats } from '@/features/papers/lib/journal-stats';
import { searchPapers } from '@/features/papers/lib/title-search';
import { usePapers } from '@/lib/firestore/queries/papers';
import { cn } from '@/lib/utils';
import type { PaperStatus } from '@/types/papers';

const STATUS_COLORS: Record<PaperStatus, string> = {
  queued: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  ocr: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  chunking: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  enriching: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  embedding: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  indexing: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  extracting_citations: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse',
  indexed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/10 text-destructive',
  cancelling: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  cancelled: 'bg-muted text-muted-foreground'
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

function formatDate(value: FirestoreTimestampLike | undefined | null): string {
  const ms = toEpochMs(value);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function PaperList() {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const { papers, loading } = usePapers();
  const [filter, setFilter] = useState<PaperFilterValue>(() => createEmptyPaperFilter());

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
    // @r179-7-applied
    const titleMatched = filter.titleQuery ? searchPapers(papers, filter.titleQuery) : papers;
    return titleMatched.filter((p) => paperPassesFilter(p, filter));
  }, [papers, filter]);

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
        <Link
          href={`/${locale}/dashboard/papers/upload`}
          className='inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium'
        >
          <IconUpload className='size-4' />
          {t('uploadFirstPaper')}
        </Link>
      </div>
    );
  }

  const hasFilter =
    filter.domain.selected.size > 0 ||
    filter.journals.size > 0 ||
    filter.yearMin !== null ||
    filter.yearMax !== null ||
    filter.titleQuery.trim().length > 0;
  const showFilterUI = papers.length > 0;

  return (
    <div className='space-y-3'>
      {showFilterUI && (
        <PaperFilterPanel
          value={filter}
          onChange={setFilter}
          papers={papers}
          visibleDomainSlugs={visibleSlugs}
        />
      )}
      {/* @r179-2-hotfix1-applied: show info card when filter narrowed to 1 journal */}
      {filter.journals.size === 1 &&
        (() => {
          const journalName = Array.from(filter.journals)[0];
          const stats = aggregateJournalStats(papers).find((s) => s.name === journalName);
          return stats ? <PaperJournalInfoCard stats={stats} /> : null;
        })()}

      {hasFilter && (
        <p className='text-xs text-muted-foreground'>
          {t('filterShowing', {
            shown: filteredPapers.length,
            total: papers.length
          })}
        </p>
      )}

      {filteredPapers.length === 0 ? (
        <p className='text-center py-8 text-sm text-muted-foreground'>{t('filterNoMatches')}</p>
      ) : (
        <div className='space-y-2'>
          {filteredPapers.map((paper) => (
            <Link
              key={paper.id}
              href={`/${locale}/dashboard/papers/${paper.id}`}
              aria-label={paper.title || t('untitled')}
              className='block border rounded-lg p-4 hover:bg-muted/50 transition-colors'
            >
              <div className='flex items-start justify-between gap-4'>
                <div className='flex-1 min-w-0'>
                  <h3 className='font-medium truncate'>{paper.title || t('untitled')}</h3>
                  <div className='flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground'>
                    <span>{formatDate(paper.uploadedAt)}</span>
                    <span>·</span>
                    <span>{formatBytes(paper.fileSize)}</span>
                    {paper.pageCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{t('nPages', { count: paper.pageCount })}</span>
                      </>
                    )}
                    {paper.chunkCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{t('nChunks', { count: paper.chunkCount })}</span>
                      </>
                    )}
                    {paper.domain && paper.domain !== 'unknown' && (
                      <>
                        <span>·</span>
                        <span className='text-foreground/70'>{t(`domain.${paper.domain}`)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
                    STATUS_COLORS[paper.status]
                  )}
                >
                  {t(`status.${paper.status}`)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
