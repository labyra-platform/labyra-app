'use client';

/**
 * R506: KPI strip.
 *
 * Four numbers that only ever answer "how much of this exists right now".
 * They were three gradient cards with a caption each, taking a full row and
 * a third of the fold to say very little. A strip gives them the weight they
 * actually carry and hands the space back to the cards that need it.
 *
 * Running jobs lead because that is the number with a clock on it.
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useDftSummary, useKpiSummary } from '@/lib/firestore/queries/dashboard';
import { useTenantCollection } from '@/lib/firestore/use-tenant-collection';
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
      className='hover:bg-muted/50 flex flex-1 items-center justify-between gap-3 px-4 py-2.5 transition-colors'
    >
      <span className='text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-xs'>
        {live && (
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              value > 0 ? 'bg-chart-2' : 'bg-muted-foreground/40'
            )}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className='shrink-0 text-lg leading-none font-semibold tabular-nums'>
        {loading ? '—' : value}
      </span>
    </Link>
  );
}

export function KpiStrip() {
  const t = useTranslations('dashboard');
  const kpi = useKpiSummary();
  const dft = useDftSummary(1);
  const { data: chemicals, isLoading: chemLoading } = useTenantCollection<{ name: string }>({
    collection: 'chemicals'
  });

  return (
    <div className='bg-card divide-border flex flex-wrap divide-x rounded-lg border'>
      <Metric
        live
        label={t('kpi.running')}
        value={dft.counts.running}
        href='/dashboard/computation'
        loading={dft.isLoading}
      />
      <Metric
        label={t('kpi.experimentsThisWeek')}
        value={kpi.experimentsThisWeek}
        href='/dashboard/experiments'
        loading={kpi.isLoading}
      />
      <Metric
        label={t('kpi.activeSamples')}
        value={kpi.activeSamples}
        href='/dashboard/samples'
        loading={kpi.isLoading}
      />
      <Metric
        label={t('kpi.chemicals')}
        value={(chemicals ?? []).length}
        href='/dashboard/chemicals'
        loading={chemLoading}
      />
    </div>
  );
}
