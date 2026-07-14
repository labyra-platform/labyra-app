'use client';

/**
 * KPI trio (R493) — three honest numbers, no invented trend arrows:
 * experiments this week, active samples, DFT jobs completed this week.
 */
import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDftSummary, useKpiSummary } from '@/lib/firestore/queries/dashboard';

function KpiCard({
  icon: Icon,
  description,
  value,
  caption
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  description: string;
  value: string;
  caption: string;
}) {
  return (
    <Card className='@container/card from-primary/5 to-card dark:bg-card bg-gradient-to-t shadow-xs'>
      <CardHeader>
        <CardDescription className='flex items-center gap-1.5'>
          <Icon className='size-3.5' aria-hidden='true' />
          {description}
        </CardDescription>
        <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
          {value}
        </CardTitle>
        <p className='text-muted-foreground line-clamp-1 text-xs'>{caption}</p>
      </CardHeader>
    </Card>
  );
}

const fmt = (n: number, loading: boolean) => (loading ? '—' : n.toLocaleString());

export function KpiCards() {
  const t = useTranslations('dashboard');
  const kpi = useKpiSummary();
  const dft = useDftSummary(1);

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
      <KpiCard
        icon={Icons.experiments}
        description={t('kpi.experimentsThisWeek')}
        value={fmt(kpi.experimentsThisWeek, kpi.isLoading)}
        caption={t('kpi.experimentsThisWeekCaption')}
      />
      <KpiCard
        icon={Icons.samples}
        description={t('kpi.activeSamples')}
        value={fmt(kpi.activeSamples, kpi.isLoading)}
        caption={t('kpi.activeSamplesCaption')}
      />
      <KpiCard
        icon={Icons.computation}
        description={t('kpi.jobsDoneWeek')}
        value={fmt(dft.completedThisWeek, dft.isLoading)}
        caption={t('kpi.jobsDoneWeekCaption')}
      />
    </div>
  );
}
