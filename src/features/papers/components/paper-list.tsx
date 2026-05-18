'use client';

// R166-ai6a-3b-fix2: + extracting_citations

import { IconFileText, IconLoader2, IconUpload } from '@tabler/icons-react';
/**
 * Realtime paper list with status badges.
 * @phase R160-ai-5b-2
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

// Firestore Timestamp may arrive as { _seconds, _nanoseconds } or { seconds, nanoseconds }
// depending on serialization path. Normalize to epoch ms.
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

  return (
    <div className='space-y-2'>
      {papers.map((paper) => (
        <Link
          key={paper.id}
          href={`/${locale}/dashboard/papers/${paper.id}`}
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
  );
}
