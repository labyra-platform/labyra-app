'use client';

import { useTranslations } from 'next-intl';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useKpiSummary } from '@/lib/firestore/queries/dashboard';

function KpiCard({
  description,
  value,
  trendLabel,
  caption,
  trend
}: {
  description: string;
  value: number | string;
  trendLabel: string;
  caption: string;
  trend: 'up' | 'down';
}) {
  const TrendIcon = trend === 'up' ? Icons.trendingUp : Icons.trendingDown;
  return (
    <Card className='@container/card'>
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
          {value}
        </CardTitle>
        <CardAction>
          <Badge variant='outline'>
            <TrendIcon />
            {trendLabel}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className='flex-col items-start gap-1.5 text-sm'>
        <div className='line-clamp-1 flex gap-2 font-medium'>
          {caption} <TrendIcon className='size-4' />
        </div>
      </CardFooter>
    </Card>
  );
}

export function KpiCards() {
  const t = useTranslations('dashboard');
  const kpi = useKpiSummary();

  const fmt = (n: number) => (kpi.isLoading ? '—' : n.toLocaleString());

  return (
    <div className='*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:grid-cols-4'>
      <KpiCard
        description={t('kpi.totalExperiments')}
        value={fmt(kpi.totalExperiments)}
        trendLabel={`+${kpi.experimentsThisWeek}`}
        caption={t('kpi.totalExperimentsCaption')}
        trend='up'
      />
      <KpiCard
        description={t('kpi.activeSamples')}
        value={fmt(kpi.activeSamples)}
        trendLabel='active'
        caption={t('kpi.activeSamplesCaption')}
        trend='up'
      />
      <KpiCard
        description={t('kpi.equipmentInUse')}
        value={fmt(kpi.equipmentInUse)}
        trendLabel='in-use'
        caption={t('kpi.equipmentInUseCaption')}
        trend='up'
      />
      <KpiCard
        description={t('kpi.experimentsThisWeek')}
        value={fmt(kpi.experimentsThisWeek)}
        trendLabel='7 days'
        caption={t('kpi.experimentsThisWeekCaption')}
        trend='up'
      />
    </div>
  );
}
