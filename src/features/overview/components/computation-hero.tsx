'use client';

/**
 * Computation hero (R493) — the dashboard's focal tile. Status roll-up of
 * dftWorkflows + the 3 most recent jobs, each showing the one number that
 * matters for its state (band gap when completed; relative time otherwise).
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { type DftJobSummaryItem, useDftSummary } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

function timeAgo(ms: number, t: ReturnType<typeof useTranslations>): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return t('timeAgoMin', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('timeAgoHour', { n: hours });
  return t('timeAgoDay', { n: Math.round(hours / 24) });
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-chart-2 animate-pulse',
  queued: 'bg-muted-foreground/50',
  completed: 'bg-primary',
  failed: 'bg-destructive'
};

function StatusPill({ status, count, label }: { status: string; count: number; label: string }) {
  return (
    <div className='flex items-center gap-1.5 text-xs'>
      <span className={cn('size-2 rounded-full', STATUS_DOT[status])} aria-hidden='true' />
      <span className='font-semibold tabular-nums'>{count}</span>
      <span className='text-muted-foreground'>{label}</span>
    </div>
  );
}

function JobRow({ job, t }: { job: DftJobSummaryItem; t: ReturnType<typeof useTranslations> }) {
  const StatusIcon =
    job.status === 'completed'
      ? Icons.check
      : job.status === 'failed'
        ? Icons.close
        : Icons.spinner;
  return (
    <Link
      href={`/dashboard/computation?id=${job.id}`}
      className='hover:bg-accent -mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors'
    >
      <StatusIcon
        className={cn(
          'size-4 shrink-0',
          job.status === 'completed' && 'text-primary',
          job.status === 'failed' && 'text-destructive',
          (job.status === 'running' || job.status === 'queued') &&
            'text-muted-foreground animate-spin'
        )}
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{job.name}</p>
        <p className='text-muted-foreground text-xs'>
          {job.calc ?? '—'} · {t(`dft.status.${job.status}`)}
        </p>
      </div>
      <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
        {job.status === 'completed' && job.gapEv != null
          ? t('dft.gapEv', { gap: job.gapEv.toFixed(2) })
          : timeAgo(job.updatedAt, t)}
      </span>
    </Link>
  );
}

export function ComputationHero() {
  const t = useTranslations('dashboard');
  const { counts, latest, total, isLoading } = useDftSummary(4);

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Icons.computation className='size-4' aria-hidden='true' />
            {t('dft.title')}
          </CardTitle>
          <Button asChild size='sm' variant='ghost' className='text-muted-foreground -mr-2'>
            <Link href='/dashboard/computation'>{t('viewAll')}</Link>
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className='h-4 w-56' />
        ) : (
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1 pt-1'>
            <StatusPill status='running' count={counts.running} label={t('dft.status.running')} />
            <StatusPill status='queued' count={counts.queued} label={t('dft.status.queued')} />
            <StatusPill
              status='completed'
              count={counts.completed}
              label={t('dft.status.completed')}
            />
            <StatusPill status='failed' count={counts.failed} label={t('dft.status.failed')} />
          </div>
        )}
      </CardHeader>
      <CardContent className='flex flex-1 flex-col'>
        {isLoading ? (
          <div className='space-y-3'>
            {[0, 1, 2].map((i) => (
              <div key={i} className='flex items-center gap-2.5'>
                <Skeleton className='size-4 rounded-full' />
                <div className='flex-1 space-y-1'>
                  <Skeleton className='h-4 w-40' />
                  <Skeleton className='h-3 w-24' />
                </div>
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className='flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center'>
            <Icons.computation className='text-muted-foreground/40 size-10' aria-hidden='true' />
            <p className='text-sm font-medium'>{t('dft.emptyTitle')}</p>
            <p className='text-muted-foreground text-sm'>{t('dft.emptyDesc')}</p>
          </div>
        ) : (
          <div className='divide-border -my-1 flex-1 divide-y'>
            {latest.map((job) => (
              <JobRow key={job.id} job={job} t={t} />
            ))}
          </div>
        )}
        <div className='mt-4'>
          <Button asChild size='sm' className='w-full'>
            <Link href='/dashboard/computation'>
              <Icons.add className='size-4' aria-hidden='true' />
              {t('dft.newRun')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
