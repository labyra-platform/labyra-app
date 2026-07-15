'use client';

/**
 * R507: DFT runs.
 *
 * Replaces the computation hero. Run names and space groups are machine
 * identifiers, not prose — monospace so `WS2/WO3-flake-on-slab-SCF` reads as
 * the token it is, and so names line up down the column where they share a
 * prefix (they usually do: one study, many variants).
 *
 * The right-hand slot carries the one number that matters for the row's state:
 * a completed run's band gap, otherwise how long ago it moved. Nothing is
 * invented — a run whose timestamp the worker never wrote shows a dash.
 */
import { useTranslations } from 'next-intl';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { type DftJobSummaryItem, useDftSummary } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';
import { useGroupRoster } from '../use-group-roster';

const STATUS_DOT: Record<DftJobSummaryItem['status'], string> = {
  running: 'bg-chart-2 animate-pulse',
  queued: 'bg-muted-foreground/40',
  pending: 'bg-muted-foreground/40',
  completed: 'bg-primary',
  failed: 'bg-destructive'
};

function timeAgo(ms: number, t: ReturnType<typeof useTranslations>): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return t('timeAgoMin', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('timeAgoHour', { n: hours });
  return t('timeAgoDay', { n: Math.round(hours / 24) });
}

export function DftRunsCard() {
  // R509: this whole card is about one feature — if it's off, it isn't here.
  const allowed = useFeatureAllowed('computation');
  const t = useTranslations('dashboard');
  const { counts, latest, total, isLoading } = useDftSummary(5);
  const { nameByUid } = useGroupRoster();

  if (allowed === false) return null;

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Icons.computation className='size-4' aria-hidden />
            {t('dft.runsTitle')}
          </CardTitle>
          <Button asChild size='sm' variant='ghost' className='text-muted-foreground -mr-2 text-xs'>
            <Link href='/dashboard/computation'>{t('viewAll')}</Link>
          </Button>
        </div>
        {!isLoading && total > 0 && (
          <div className='flex flex-wrap gap-x-3 gap-y-1 pt-0.5'>
            {(['running', 'queued', 'completed', 'failed'] as const).map((s) =>
              counts[s] > 0 ? (
                <span key={s} className='text-muted-foreground flex items-center gap-1 text-xs'>
                  <span className={cn('size-1.5 rounded-full', STATUS_DOT[s])} aria-hidden />
                  <span className='text-foreground font-medium tabular-nums'>{counts[s]}</span>
                  {t(`dft.status.${s}`)}
                </span>
              ) : null
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className='flex-1'>
        {isLoading ? (
          <div className='space-y-3'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : total === 0 ? (
          <div className='flex h-full flex-col items-center justify-center gap-2 py-8 text-center'>
            <p className='text-sm font-medium'>{t('dft.emptyTitle')}</p>
            <Button asChild size='sm'>
              <Link href='/dashboard/computation'>
                <Icons.add className='size-4' aria-hidden />
                {t('dft.newRun')}
              </Link>
            </Button>
          </div>
        ) : (
          <ul className='divide-border -my-1 divide-y'>
            {latest.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/dashboard/computation?id=${job.id}`}
                  className='hover:bg-accent -mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors'
                >
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[job.status])}
                    aria-hidden
                  />
                  <span className='min-w-0 flex-1 truncate font-mono text-xs'>{job.name}</span>
                  {job.spaceGroup && (
                    <span className='bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]'>
                      {job.spaceGroup}
                    </span>
                  )}
                  <span className='shrink-0 text-xs tabular-nums'>
                    {job.status === 'completed' && job.gapEv != null ? (
                      <span className='font-medium'>
                        {t('dft.gapEv', { gap: job.gapEv.toFixed(2) })}
                      </span>
                    ) : job.updatedAt != null ? (
                      <span className='text-muted-foreground'>{timeAgo(job.updatedAt, t)}</span>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </span>
                  <span className='text-muted-foreground w-14 shrink-0 truncate text-right text-xs'>
                    {job.ownerUid ? (nameByUid.get(job.ownerUid) ?? '') : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
