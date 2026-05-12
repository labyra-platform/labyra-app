'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { useChemicalsByHazard } from '@/lib/firestore/queries/dashboard';
import { useTranslations } from 'next-intl';

const chartConfig = {
  count: {
    label: 'Chemicals',
    color: 'var(--chart-1)'
  }
} satisfies ChartConfig;

export function AreaGraph() {
  const t = useTranslations('dashboard.charts');
  const { data, isLoading } = useChemicalsByHazard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chemicalsByHazard')}</CardTitle>
        <CardDescription>{t('chemicalsByHazardDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis dataKey='hazard' tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <DottedBackgroundPattern config={chartConfig} />
            </defs>
            <Area
              dataKey='count'
              type='natural'
              fill='url(#dotted-background-pattern-count)'
              fillOpacity={0.4}
              stroke='var(--color-count)'
              strokeWidth={0.8}
            />
          </AreaChart>
        </ChartContainer>
        {isLoading && <p className='text-muted-foreground mt-2 text-xs'>Loading…</p>}
      </CardContent>
    </Card>
  );
}

const DottedBackgroundPattern = ({ config }: { config: ChartConfig }) => {
  const items = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, value.color])
  );
  return (
    <>
      {Object.entries(items).map(([key, value]) => (
        <pattern
          key={key}
          id={`dotted-background-pattern-${key}`}
          x='0'
          y='0'
          width='7'
          height='7'
          patternUnits='userSpaceOnUse'
        >
          <circle cx='5' cy='5' r='1.5' fill={value} opacity={0.5}></circle>
        </pattern>
      ))}
    </>
  );
};
