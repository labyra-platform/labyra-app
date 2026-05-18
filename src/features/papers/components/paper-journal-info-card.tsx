'use client';

/**
 * Single-journal info card — shown when user filters to exactly 1 journal.
 *
 * Pure display: derives stats from filtered paper list. No external fetch.
 *
 * @phase R179-2
 * @r179-2-applied
 */
import { IconBook2, IconFingerprint, IconHash } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type { JournalStats } from '@/features/papers/lib/journal-stats';

interface Props {
  stats: JournalStats;
}

export function PaperJournalInfoCard({ stats }: Props) {
  const t = useTranslations('papers');
  const yearText =
    stats.yearMin === stats.yearMax ? String(stats.yearMin) : `${stats.yearMin}–${stats.yearMax}`;

  return (
    <div className='border rounded-lg p-4 bg-indigo-500/5 border-indigo-500/30 space-y-2'>
      <div className='flex items-start gap-3'>
        <IconBook2 className='size-5 mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0' />
        <div className='flex-1 min-w-0'>
          <h3 className='font-medium leading-tight break-words'>{stats.name}</h3>
          {stats.short && stats.short !== stats.name && (
            <p className='text-muted-foreground text-xs mt-0.5'>{stats.short}</p>
          )}
        </div>
      </div>
      <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pl-8'>
        <span className='inline-flex items-center gap-1'>
          <IconHash className='size-3' aria-hidden />
          {t('journalInfoCount', { count: stats.count })}
        </span>
        {stats.yearMin !== Number.POSITIVE_INFINITY && stats.yearMax > 0 && <span>{yearText}</span>}
        {stats.issn && (
          <span className='inline-flex items-center gap-1'>
            <IconFingerprint className='size-3' aria-hidden />
            ISSN {stats.issn}
          </span>
        )}
      </div>
    </div>
  );
}
