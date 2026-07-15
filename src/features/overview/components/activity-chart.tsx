'use client';

/**
 * Activity — 30 days (R507, rebuilt on Panel R510).
 *
 * Three series, because "the lab was busy" is a different claim from "the lab
 * ran experiments": a month of DFT and a month of bench work look identical on
 * one line. Counts-per-day is a bar chart (§9) — a line through zeros is a
 * design failure, not a dataset.
 *
 * R510: the legend sits in the panel header, not under the plot. Recharts'
 * default drops it below the axis, where it reads as a caption for the page
 * rather than a key for this chart — and it pushed the plot up against the
 * card edge. In the header it is where the eye already is when it arrives.
 */
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityDaily } from '@/lib/firestore/queries/dashboard';

/** §9: chart palette, never the status palette — the blue that means "running"
 *  on this page must not also mean "experiments" in a plot. */
const SERIES = [
  { key: 'experiments', color: 'var(--chart-1)' },
  { key: 'dft', color: 'var(--chart-3)' },
  { key: 'samples', color: 'var(--chart-4)' }
] as const;

function Legend({ config }: { config: ChartConfig }) {
  return (
    <div className='flex shrink-0 items-center gap-3'>
      {SERIES.map((s) => (
        <span key={s.key} className='text-muted-foreground text-meta flex items-center gap-2'>
          <span
            className='size-2 rounded-full'
            style={{ background: s.color }}
            aria-hidden='true'
          />
          {String(config[s.key]?.label ?? s.key)}
        </span>
      ))}
    </div>
  );
}

export function ActivityChart() {
  const t = useTranslations('dashboard');
  const { data, isLoading } = useActivityDaily(30);

  const chartConfig = {
    experiments: { label: t('activity.experiments'), color: 'var(--chart-1)' },
    dft: { label: t('activity.dft'), color: 'var(--chart-3)' },
    samples: { label: t('activity.samples'), color: 'var(--chart-4)' }
  } satisfies ChartConfig;

  const empty = !isLoading && data.every((d) => d.experiments + d.dft + d.samples === 0);

  return (
    <Panel title={t('activity.title')} action={<Legend config={chartConfig} />}>
      {isLoading ? (
        // §7: skeleton at the exact height of the loaded chart — a wrong height
        // is the layout shift skeletons exist to prevent.
        <Skeleton className='h-[var(--panel-viewport)] w-full' />
      ) : empty ? (
        <PanelEmpty title={t('activity.emptyTitle')} description={t('activity.empty')} />
      ) : (
        <ChartContainer config={chartConfig} className='h-[var(--panel-viewport)] w-full'>
          <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12, top: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='day'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval='preserveStartEnd'
              minTickGap={24}
              fontSize={11}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}
