'use client';

import { LabelList, Pie, PieChart } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { useEquipmentByType } from '@/lib/firestore/queries/dashboard';
import { useTranslations } from 'next-intl';

const chartConfig = {
  count: { label: 'Equipment' },
  microscopy: { label: 'Microscopy', color: 'var(--chart-1)' },
  spectroscopy: { label: 'Spectroscopy', color: 'var(--chart-2)' },
  analysis: { label: 'Analysis', color: 'var(--chart-3)' }
} satisfies ChartConfig;

export function PieGraph() {
  const t = useTranslations('dashboard.charts');
  const { data, isLoading } = useEquipmentByType();

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='items-center pb-0'>
        <CardTitle>{t('equipmentByType')}</CardTitle>
        <CardDescription>{t('equipmentByTypeDescription')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 items-center justify-center pb-0'>
        <ChartContainer
          config={chartConfig}
          className='[&_.recharts-text]:fill-background mx-auto aspect-square max-h-[300px] min-h-[250px]'
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey='count' hideLabel />} />
            <Pie
              data={data}
              innerRadius={30}
              dataKey='count'
              radius={10}
              cornerRadius={8}
              paddingAngle={4}
            >
              <LabelList
                dataKey='count'
                stroke='none'
                fontSize={12}
                fontWeight={500}
                fill='currentColor'
                formatter={(value: number) => value.toString()}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        {isLoading && <p className='text-muted-foreground mt-2 text-xs'>Loading…</p>}
      </CardContent>
    </Card>
  );
}
