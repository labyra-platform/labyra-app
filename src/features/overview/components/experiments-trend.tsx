'use client';

/**
 * Experiments trend (R493) — one series, 30 trailing days, no legend clutter.
 */
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useExperimentsDaily } from '@/lib/firestore/queries/dashboard';

const chartConfig = {
  count: { label: 'Experiments', color: 'var(--chart-1)' }
} satisfies ChartConfig;

export function ExperimentsTrend() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useExperimentsDaily(30);

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>{t('trend.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className='h-[160px] w-full' />
        ) : (
          <ChartContainer config={chartConfig} className='h-[160px] w-full'>
            <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' />
              <XAxis
                dataKey='day'
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={6}
                fontSize={11}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator='line' />} />
              <Area
                dataKey='count'
                type='monotone'
                fill='var(--color-count)'
                fillOpacity={0.15}
                stroke='var(--color-count)'
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
