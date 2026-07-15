'use client';

/**
 * R507: 30-day activity.
 *
 * Three series, because "the lab was busy" is a different claim from "the lab
 * ran experiments" — a month of DFT and a month of bench work look identical
 * on a single line. Replaces the single-series area chart, whose axis also
 * clipped its first label ("i-15") by letting recharts drop the tick's
 * overflow at the plot edge.
 */
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityDaily } from '@/lib/firestore/queries/dashboard';

export function ActivityChart() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useActivityDaily(30);

  const chartConfig = {
    experiments: { label: t('activity.experiments'), color: 'var(--chart-2)' },
    dft: { label: t('activity.dft'), color: 'var(--chart-1)' },
    samples: { label: t('activity.samples'), color: 'var(--chart-4)' }
  } satisfies ChartConfig;

  const empty = !isLoading && data.every((d) => d.experiments + d.dft + d.samples === 0);

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>{t('activity.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className='h-[160px] w-full' />
        ) : empty ? (
          <p className='text-muted-foreground flex h-[160px] items-center justify-center text-sm'>
            {t('activity.empty')}
          </p>
        ) : (
          <ChartContainer config={chartConfig} className='h-[160px] w-full'>
            {/* Left/right margin so the first and last tick have room to sit
                under their bars instead of being clipped by the plot edge. */}
            <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12, top: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' />
              <XAxis
                dataKey='day'
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval='preserveStartEnd'
                minTickGap={24}
                fontSize={10}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey='experiments' fill='var(--color-experiments)' radius={[2, 2, 0, 0]} />
              <Bar dataKey='dft' fill='var(--color-dft)' radius={[2, 2, 0, 0]} />
              <Bar dataKey='samples' fill='var(--color-samples)' radius={[2, 2, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
