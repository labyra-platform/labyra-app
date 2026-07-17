'use client';

/**
 * Activity card — bar chart and heatmap over a year × range window.
 *
 * Built to `docs/design/activity-chart.md`. That spec opens §9 by asking
 * whether this card should exist at all: nine events over 182 days leaves both
 * charts mostly empty, and a nine-row feed would say more. It exists because
 * that question was asked and answered — this is a deliberate bet on a busier
 * lab, not an oversight. Worth writing down, because the next person to look at
 * an empty card will assume nobody thought about it.
 *
 * @phase R555 — activity card per spec
 */
import { IconChartBar, IconLayoutGrid } from '@tabler/icons-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ActivityDay, useActivityDaily } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

type Bucket = 'day' | 'week' | 'month';
type RangeKey = '1m' | '3m' | '6m' | '12m';

/**
 * §2: the bucket is a function of the range, chosen to land the column count in
 * 12–30. Under twelve the bars are bricks; over thirty they are threads. This is
 * why the list is 1/3/6/12 and not, say, 2 months — that would be eight weeks
 * (under the floor) or sixty days (over the ceiling). The range list is a
 * consequence of the geometry, not a menu someone liked the look of.
 */
const RANGES: Record<RangeKey, { months: number; bucket: Bucket; cols: number }> = {
  '1m': { months: 1, bucket: 'day', cols: 30 },
  '3m': { months: 3, bucket: 'week', cols: 13 },
  '6m': { months: 6, bucket: 'week', cols: 26 },
  '12m': { months: 12, bucket: 'month', cols: 12 }
};

/** §6: a heatmap needs 20px-capped square cells to fit 596px. 5 or 13 weeks cannot. */
const HEATMAP_OK: Record<RangeKey, boolean> = { '1m': false, '3m': false, '6m': true, '12m': true };

/**
 * §3: three shades of one hue, not three hues.
 *
 * These charts get exported into manuscripts. Three saturated hues become three
 * identical greys in B&W print; dark/mid/light survives. The lightest tier
 * carries a stroke because a pale fill on white reads as empty space rather
 * than as data.
 */
const TIERS = [
  { key: 'dft', fill: 'var(--chart-1)', stroke: undefined },
  { key: 'samples', fill: 'color-mix(in oklch, var(--chart-1) 55%, white)', stroke: undefined },
  {
    key: 'experiments',
    fill: 'color-mix(in oklch, var(--chart-1) 25%, white)',
    stroke: 'var(--chart-1)'
  }
] as const;

/** §3: never let a bar hit the ceiling — one event must not look like a peak. */
const Y_FLOOR = 4;

const CELL_MAX = 20;
const PLOT_H = 150;

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * §4: the window is year × range multiplied, never two free dropdowns.
 *
 * "6 tháng" means the six months back from today in the current year, and the
 * last six months of a past year. Same words, two windows — which is exactly
 * why the subtitle has to print the real dates rather than repeat the label.
 */
function windowFor(year: number, range: RangeKey, now: Date): { start: Date; end: Date } {
  const { months } = RANGES[range];
  const isCurrent = year === now.getFullYear();
  const end = isCurrent ? new Date(now) : new Date(year, 11, 31);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - months + 1);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function ActivityCard() {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const [range, setRange] = useState<RangeKey>('6m');
  const [mode, setMode] = useState<'bar' | 'heatmap'>('bar');
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());

  const { start, end } = useMemo(() => windowFor(year, range, now), [year, range, now]);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const { data, isLoading } = useActivityDaily(days, end.getTime());

  const bucket = RANGES[range].bucket;
  const heatmapAllowed = HEATMAP_OK[range];
  const effectiveMode = heatmapAllowed ? mode : 'bar';

  const { columns, total, cells } = useMemo(() => {
    const keyOf = (d: ActivityDay) => {
      const dt = new Date(`${d.iso}T00:00:00`);
      if (bucket === 'day') return d.iso;
      if (bucket === 'month') return d.iso.slice(0, 7);
      return startOfWeek(dt).toISOString().slice(0, 10);
    };
    const map = new Map<
      string,
      { label: string; dft: number; samples: number; experiments: number }
    >();
    for (const d of data) {
      const k = keyOf(d);
      const row = map.get(k) ?? { label: k, dft: 0, samples: 0, experiments: 0 };
      row.dft += d.dft;
      row.samples += d.samples;
      row.experiments += d.experiments;
      map.set(k, row);
    }
    const cols = [...map.values()];
    return {
      columns: cols,
      total: cols.reduce((a, r) => a + r.dft + r.samples + r.experiments, 0),
      cells: data
    };
  }, [data, bucket]);

  const totals = useMemo(
    () => ({
      dft: columns.reduce((a, c) => a + c.dft, 0),
      samples: columns.reduce((a, c) => a + c.samples, 0),
      experiments: columns.reduce((a, c) => a + c.experiments, 0)
    }),
    [columns]
  );

  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        TIERS.map((tier) => [tier.key, { label: t(`activity.${tier.key}`), color: tier.fill }])
      ) as ChartConfig,
    [t]
  );

  const yMax = Math.max(Y_FLOOR, ...columns.map((c) => c.dft + c.samples + c.experiments));

  /** §4/§8.4: the real window and the bucket, never "tổng 9". */
  const subtitle = `${t('activity.events', { count: total })} · ${format.dateTime(start, {
    month: 'short'
  })}–${format.dateTime(end, { month: 'short', year: 'numeric' })} · ${t(`activity.by.${bucket}`)}`;

  return (
    <Panel
      title={t('activity.title')}
      description={subtitle}
      action={
        <div className='flex items-center gap-1.5'>
          {/* §5: broadest control outermost — type, then year, then range. */}
          <ToggleGroup
            type='single'
            size='sm'
            value={effectiveMode}
            onValueChange={(v) => v && setMode(v as 'bar' | 'heatmap')}
          >
            <ToggleGroupItem value='bar' aria-label={t('activity.modeBar')}>
              <IconChartBar className='size-4' />
            </ToggleGroupItem>
            {/* §5: a dead button that says nothing is worse than no button. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <ToggleGroupItem
                    value='heatmap'
                    disabled={!heatmapAllowed}
                    aria-label={t('activity.modeHeatmap')}
                  >
                    <IconLayoutGrid className='size-4' />
                  </ToggleGroupItem>
                </span>
              </TooltipTrigger>
              {!heatmapAllowed && (
                <TooltipContent>{t('activity.heatmapNeedsRange')}</TooltipContent>
              )}
            </Tooltip>
          </ToggleGroup>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className='h-7 w-[86px]' aria-label={t('activity.year')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1].map((i) => (
                <SelectItem key={i} value={String(now.getFullYear() - i)}>
                  {now.getFullYear() - i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className='h-7 w-[104px]' aria-label={t('activity.range')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`activity.range.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {isLoading ? (
        // §7: exactly the plot height, so loading does not jump the card.
        <Skeleton style={{ height: PLOT_H }} className='w-full' />
      ) : total === 0 ? (
        // §7: no axes, no gridlines. An empty 26-column frame is not information.
        <PanelEmpty title={t('activity.emptyTitle')} description={t('activity.empty')} />
      ) : effectiveMode === 'bar' ? (
        <>
          <ChartContainer config={chartConfig} style={{ height: PLOT_H }} className='w-full'>
            <BarChart data={columns} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' />
              <XAxis dataKey='label' tickLine={false} axisLine={false} tick={false} />
              <YAxis domain={[0, yMax]} tickLine={false} axisLine={false} width={28} />
              {/* §3: zero is the reading anchor; the gridlines are just a ruler. */}
              <ReferenceLine y={0} stroke='var(--border)' strokeWidth={1.5} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {/* §3: stack order is fixed. Sorting by value per column would make
                  the tiers uncomparable across columns. */}
              {TIERS.map((tier) => (
                <Bar
                  key={tier.key}
                  dataKey={tier.key}
                  stackId='a'
                  fill={tier.fill}
                  stroke={tier.stroke}
                  radius={tier.key === 'experiments' ? [2, 2, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>

          {/* §3: the legend doubles as the stats table — a colour key with no
              numbers wastes a row. */}
          <div className='text-meta flex items-center justify-center gap-3'>
            {TIERS.map((tier) => (
              <span key={tier.key} className='flex items-center gap-1.5'>
                <span
                  className='size-2.5 rounded-[2px]'
                  style={{
                    backgroundColor: tier.fill,
                    boxShadow: tier.stroke ? `inset 0 0 0 1px ${tier.stroke}` : undefined
                  }}
                  aria-hidden='true'
                />
                {t(`activity.${tier.key}`)}
                <span className='text-muted-foreground tabular-nums'>{totals[tier.key]}</span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <HeatGrid cells={cells} start={start} format={format} t={t} />
      )}
    </Panel>
  );
}

/**
 * §6: CSS grid, not a chart library — Recharts has no heatmap and this is not
 * worth a dependency.
 *
 * One `title` per cell rather than 182 Radix tooltips: the spec's v1 call, and
 * the right one — 182 portalled tooltip instances to show one line of text each
 * is a lot of React for a hover.
 */
function HeatGrid({
  cells,
  start,
  format,
  t
}: {
  cells: ActivityDay[];
  start: Date;
  format: ReturnType<typeof useFormatter>;
  t: ReturnType<typeof useTranslations>;
}) {
  const cols = Math.ceil(cells.length / 7);
  const cell = Math.min(CELL_MAX, Math.floor((596 - (cols - 1) * 3) / cols));
  const lead = (start.getDay() + 6) % 7;
  const padded: (ActivityDay | null)[] = [...(Array(lead).fill(null) as null[]), ...cells];
  while (padded.length % 7 !== 0) padded.push(null);

  const active = cells
    .map((d) => d.dft + d.samples + d.experiments)
    .filter((n) => n > 0)
    .toSorted((a, b) => a - b);
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(active.length * p))] ?? 0;
  const level = (n: number) =>
    n <= 0 ? 0 : n <= q(0.25) ? 1 : n <= q(0.5) ? 2 : n <= q(0.75) ? 3 : 4;
  const FILL = [
    'bg-muted',
    'bg-[var(--chart-1)]/25',
    'bg-[var(--chart-1)]/50',
    'bg-[var(--chart-1)]/75',
    'bg-[var(--chart-1)]'
  ];

  return (
    <div className='flex items-center justify-center' style={{ height: PLOT_H }}>
      <div className='grid grid-flow-col grid-rows-7 gap-[3px]'>
        {padded.map((d, i) =>
          d === null ? (
            <div key={`pad-${i}`} style={{ width: cell, height: cell }} aria-hidden='true' />
          ) : (
            <div
              key={d.iso}
              style={{ width: cell, height: cell }}
              className={cn('rounded-[2px]', FILL[level(d.dft + d.samples + d.experiments)])}
              title={`${format.dateTime(new Date(`${d.iso}T00:00:00`), { day: '2-digit', month: '2-digit' })} · ${t('activity.breakdown', { experiments: d.experiments, dft: d.dft, samples: d.samples })}`}
            />
          )
        )}
      </div>
    </div>
  );
}
