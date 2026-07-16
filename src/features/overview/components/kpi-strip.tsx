'use client';

/**
 * Stat strip (R506, revised R510).
 *
 * §11 sets the bar for a number appearing here: it must change day to day AND
 * click through to work. R510 drops the chemicals count, which does neither —
 * stock totals move on delivery day, not daily, and the hazard panel already
 * reads the same collection to say something you can act on. A number that
 * fails both tests belongs in the header of its own list page.
 *
 * What's left is the three numbers a researcher is actually tracking. Running
 * jobs lead: it's the only one with a clock on it.
 */
import { useTranslations } from 'next-intl';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { Link } from '@/i18n/navigation';
import { useDftSummary, useKpiSummary } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

function Metric({
  label,
  value,
  href,
  loading,
  live
}: {
  label: string;
  value: number;
  href: string;
  loading: boolean;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className='hover:bg-muted/50 flex flex-1 items-center justify-between gap-3 px-5 py-2.5 transition-colors'
    >
      <span className='text-muted-foreground text-caption flex min-w-0 items-center gap-2 truncate'>
        {live && (
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              value > 0 ? 'bg-blue-500' : 'bg-muted-foreground/40'
            )}
            aria-hidden='true'
          />
        )}
        {label}
      </span>
      {/* §2: tabular-nums on every number that reaches the screen. */}
      <span className='text-stat shrink-0 font-medium tabular-nums'>{loading ? '—' : value}</span>
    </Link>
  );
}

export function KpiStrip() {
  const t = useTranslations('dashboard');
  const kpi = useKpiSummary();
  const dft = useDftSummary(1);
  // A metric for a feature this member can't use is dropped, not zeroed —
  // "0 samples" is still an answer about samples, and a false one.
  const canComputation = useFeatureAllowed('computation');
  const canExperiments = useFeatureAllowed('experiments');
  const canSamples = useFeatureAllowed('samples');
  const canPapers = useFeatureAllowed('papers');
  const canBookings = useFeatureAllowed('bookings');

  return (
    <div className='bg-card divide-border border-border flex flex-wrap divide-x rounded-xl border'>
      {canComputation !== false && (
        <Metric
          live
          label={t('kpi.running')}
          value={dft.counts.running}
          href='/dashboard/computation'
          loading={dft.isLoading}
        />
      )}
      {canExperiments !== false && (
        <Metric
          label={t('kpi.experimentsThisWeek')}
          value={kpi.experimentsThisWeek}
          href='/dashboard/experiments'
          loading={kpi.isLoading}
        />
      )}
      {canSamples !== false && (
        <Metric
          label={t('kpi.activeSamples')}
          value={kpi.activeSamples}
          href='/dashboard/samples'
          loading={kpi.isLoading}
        />
      )}
      {/* R533: both of these were already being computed — equipmentInUse has
          been in KpiSummary and never rendered, and papers carry a status the
          strip never asked about. `live` marks the two that move on their own:
          a paper finishes indexing and an instrument frees up without anyone
          doing anything, and a number that changes while you watch should say
          it is that kind of number. */}
      {canPapers !== false && (
        <Metric
          live
          label={t('kpi.papersProcessing')}
          value={kpi.papersProcessing}
          href='/dashboard/papers'
          loading={kpi.isLoading}
        />
      )}
      {canBookings !== false && (
        <Metric
          live
          label={t('kpi.equipmentInUse')}
          value={kpi.equipmentInUse}
          href='/dashboard/equipment'
          loading={kpi.isLoading}
        />
      )}
    </div>
  );
}
