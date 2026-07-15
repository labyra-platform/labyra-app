'use client';

/**
 * DFT runs (R507, rebuilt on Panel R510).
 *
 * Run names are machine identifiers, so they're monospaced and line up where
 * they share a prefix — one study, many variants, which is how these are
 * actually read.
 *
 * R510 fixes two things the layout got wrong:
 *
 *  - A fixed-width owner column was reserved on every row and left empty
 *    whenever the owner wasn't in the caller's own group roster, which is most
 *    of the time. Dead space on every row to sometimes hold a name. The name
 *    now renders only when it's known, and takes no width when it isn't.
 *  - One right-hand slot showed a band gap on some rows and a relative time on
 *    others, so the column meant two different things depending on the row.
 *    They are separate facts and now occupy separate columns: age always, gap
 *    when there is one.
 */
import { useLocale, useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Panel, PanelEmpty, PanelList, PanelRow } from '@/components/ui-extra/panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { Link } from '@/i18n/navigation';
import { type DftJobSummaryItem, useDftSummary } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';
import { dftBandGap, formatQuantity } from '@/types/quantity';
import { useGroupRoster } from '../use-group-roster';

/** §5: the status palette. Fixed meaning, never reused for identity. */
const STATUS_DOT: Record<DftJobSummaryItem['status'], string> = {
  running: 'bg-blue-500',
  queued: 'bg-amber-500',
  pending: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-destructive'
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', 86_400_000]
];

/** §8: Intl, never hand-formatted — '1.240' and '1,240' invert in meaning. */
function useAge(locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  return (ms: number) => {
    const delta = Date.now() - ms;
    let [unit, size] = UNITS[0];
    for (const [u, s] of UNITS) {
      if (delta >= s) [unit, size] = [u, s];
    }
    return rtf.format(-Math.max(1, Math.round(delta / size)), unit);
  };
}

export function DftRunsCard() {
  const allowed = useFeatureAllowed('computation');
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { counts, latest, total, isLoading } = useDftSummary(5);
  const { nameByUid } = useGroupRoster();
  const age = useAge(locale);

  if (allowed === false) return null;

  const statusLine = (['running', 'queued', 'completed', 'failed'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => (
      <span key={s} className='text-muted-foreground text-caption flex items-center gap-2'>
        <span className={cn('size-1.5 rounded-full', STATUS_DOT[s])} aria-hidden='true' />
        <span className='text-foreground tabular-nums'>{counts[s]}</span>
        {t(`dft.status.${s}`)}
      </span>
    ));

  return (
    <Panel
      title={t('dft.runsTitle')}
      icon={Icons.computation}
      action={
        <Link
          href='/dashboard/computation'
          className='text-muted-foreground hover:text-foreground text-caption shrink-0'
        >
          {t('viewAll')}
        </Link>
      }
    >
      {isLoading ? (
        <div className='space-y-2'>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className='h-9 w-full' />
          ))}
        </div>
      ) : total === 0 ? (
        <PanelEmpty
          title={t('dft.emptyTitle')}
          description={t('dft.emptyDesc')}
          action={
            <Button asChild size='sm' className='mt-1'>
              <Link href='/dashboard/computation'>
                <Icons.add className='size-4' aria-hidden='true' />
                {t('dft.newRun')}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {statusLine.length > 0 && <div className='flex flex-wrap gap-3'>{statusLine}</div>}
          <PanelList>
            {latest.map((job) => {
              const owner = job.ownerUid ? nameByUid.get(job.ownerUid) : undefined;
              return (
                <PanelRow key={job.id} className='gap-2'>
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[job.status])}
                    aria-hidden='true'
                  />
                  <Link
                    href={`/dashboard/computation?id=${job.id}`}
                    className='text-body min-w-0 flex-1 truncate font-mono hover:underline'
                  >
                    {job.name}
                  </Link>
                  {job.spaceGroup && (
                    <span className='bg-muted text-muted-foreground text-meta shrink-0 rounded-full px-2 py-0.5 font-mono'>
                      {job.spaceGroup}
                    </span>
                  )}
                  {/* Owner only when we can name them — no column reserved for
                      a value we usually don't have. */}
                  {owner && (
                    <span className='text-muted-foreground text-meta max-w-20 shrink-0 truncate'>
                      {owner}
                    </span>
                  )}
                  {/* Two facts, two columns — the gap slot stays a gap slot
                      even on rows that have none. */}
                  <span className='text-meta w-24 shrink-0 text-right tabular-nums'>
                    {job.gapEv != null ? (
                      <span className='text-foreground font-medium'>
                        {formatQuantity(dftBandGap(job.gapEv), locale)}
                      </span>
                    ) : (
                      ''
                    )}
                  </span>
                  <span className='text-muted-foreground text-meta w-14 shrink-0 text-right tabular-nums'>
                    {job.updatedAt != null ? age(job.updatedAt) : '—'}
                  </span>
                </PanelRow>
              );
            })}
          </PanelList>
        </>
      )}
    </Panel>
  );
}
