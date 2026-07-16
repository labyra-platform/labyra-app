'use client';

/**
 * PapersLandscape — library overview dashboard (R237cl).
 * Visualizes the distribution of the library using data already on each Paper
 * (OpenAlex field, normalized publisher, year). Pure client aggregation — no
 * extra OpenAlex/Firestore calls. Rendered as the "Overview" view in PaperList.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { Panel } from '@/components/ui-extra/panel';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import {
  aggregateOpenAlexTree,
  aggregatePublisherTree,
  aggregateYearCounts,
  aggregateYearRange
} from '@/features/papers/lib/journal-stats';
import type { Paper } from '@/types/papers';

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
];

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='rounded-lg border bg-card px-4 py-3'>
      <p className='text-2xl font-semibold tabular-nums'>{value}</p>
      <p className='text-xs text-muted-foreground'>{label}</p>
    </div>
  );
}

export function PapersLandscape({ papers }: { papers: Paper[] }) {
  const t = useTranslations('papers');

  const fields = useMemo(
    () => aggregateOpenAlexTree(papers).map((f) => ({ name: f.field, count: f.count })),
    [papers]
  );
  const publishers = useMemo(
    () =>
      aggregatePublisherTree(papers)
        .filter((p) => p.publisher)
        .map((p) => ({ name: p.publisher, count: p.count })),
    [papers]
  );
  const years = useMemo(
    () => aggregateYearCounts(papers).map((y) => ({ name: String(y.year), count: y.count })),
    [papers]
  );
  const range = useMemo(() => aggregateYearRange(papers), [papers]);

  const fieldTotal = fields.reduce((s, f) => s + f.count, 0);
  const chartConfig = { count: { label: t('landscapePapers') } } satisfies ChartConfig;

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <StatTile label={t('landscapePapers')} value={papers.length} />
        <StatTile label={t('landscapeFields')} value={fields.length} />
        <StatTile label={t('landscapePublishers')} value={publishers.length} />
        <StatTile
          label={t('landscapeYearSpan')}
          value={range ? `${range.min}–${range.max}` : '—'}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        {/* OpenAlex field — pie */}
        <Panel
          title={t('landscapeByField')}
          description={t('landscapeByFieldDesc', { count: fieldTotal })}
        >
          {fields.length === 0 ? (
            <p className='py-12 text-center text-sm text-muted-foreground'>
              {t('landscapeNoData')}
            </p>
          ) : (
            /* R551: chart and legend are one row. The legend used to sit under
               the ring as a wrapped, centred row — six fields wrapped onto two
               lines, and the height those lines added pushed the year chart in
               the card below far enough down that its axis fell off the bottom.
               Beside the ring the same six cost nothing: it is 240px tall and
               the space to its right was empty. */
            <div className='flex items-center gap-4'>
              {/* R534: h, not max-h. This pie vanished when its parent became a
                  Panel — `mx-auto` sets auto inline margins, which on a flex
                  item cancel align-items:stretch, so the container collapsed to
                  fit-content and aspect-square squared zero. A definite height
                  makes the size come from the element rather than from whatever
                  its parent happens to be this month. */}
              <ChartContainer config={chartConfig} className='aspect-square h-[240px] shrink-0'>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey='name' />} />
                  {/* cornerRadius was never in this file — I checked the history
                    rather than claim to restore it — but shadcn's pie example
                    carries it and it does real work: with paddingAngle already
                    parting the slices, rounded ends stop the 1-count slivers
                    reading as tick marks on the ring. */}
                  <Pie
                    data={fields}
                    dataKey='count'
                    nameKey='name'
                    innerRadius={45}
                    paddingAngle={3}
                    cornerRadius={4}
                  >
                    {fields.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey='count'
                      stroke='none'
                      fontSize={11}
                      fill='currentColor'
                      formatter={(v: number) => v.toString()}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>

              <ul className='min-w-0 flex-1 space-y-1'>
                {fields.map((f, i) => (
                  <li key={f.name} className='flex items-center gap-2'>
                    <span
                      className='size-2.5 shrink-0 rounded-full'
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      aria-hidden='true'
                    />
                    <span className='text-body min-w-0 flex-1 truncate'>{f.name}</span>
                    <span className='text-muted-foreground text-meta tabular-nums'>{f.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* Publisher — horizontal bar */}
        <Panel title={t('landscapeByPublisher')} description={t('landscapeByPublisherDesc')}>
          {publishers.length === 0 ? (
            <p className='py-12 text-center text-sm text-muted-foreground'>
              {t('landscapeNoData')}
            </p>
          ) : (
            <ChartContainer config={chartConfig} className='max-h-[280px] w-full'>
              <BarChart
                data={publishers}
                layout='vertical'
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <XAxis type='number' hide />
                <YAxis
                  type='category'
                  dataKey='name'
                  width={140}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <ChartTooltip content={<ChartTooltipContent nameKey='name' hideLabel />} />
                <Bar dataKey='count' radius={4}>
                  {publishers.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <LabelList dataKey='count' position='right' fontSize={11} fill='currentColor' />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </Panel>

        {/* Year — vertical histogram (full width) */}
        <Panel
          title={t('landscapeByYear')}
          description={t('landscapeByYearDesc')}
          className='lg:col-span-2'
        >
          {years.length === 0 ? (
            <p className='py-12 text-center text-sm text-muted-foreground'>
              {t('landscapeNoData')}
            </p>
          ) : (
            <ChartContainer config={chartConfig} className='max-h-[240px] w-full'>
              <BarChart data={years} margin={{ left: 4, right: 4, top: 12, bottom: 4 }}>
                <XAxis dataKey='name' tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent nameKey='name' hideLabel />} />
                <Bar dataKey='count' fill='var(--chart-1)' radius={[4, 4, 0, 0]}>
                  <LabelList dataKey='count' position='top' fontSize={11} fill='currentColor' />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
