'use client';

/**
 * Activity heatmap — 12 weeks, GitHub-style.
 *
 * ## Why 12 weeks and not 30 days
 *
 * A heatmap earns its shape by showing *rhythm*: which weekdays this lab
 * works, where the gaps are, whether a streak is building. 30 days is five
 * columns, and five columns cannot show a rhythm — it would be a bar chart
 * wearing squares. Twelve weeks is the smallest window where a weekday pattern
 * is legible, and it still fits the half-width slot without shrinking cells
 * below a hittable size.
 *
 * ## What this gives up
 *
 * The bar chart carried three series, and its own note argued for them: "the
 * lab was busy" is a different claim from "the lab ran experiments". A cell has
 * one colour, so the grid shows the total and the tooltip keeps the breakdown.
 * That is a real loss on the surface and a real gain in the shape — but it is a
 * trade, not a free upgrade.
 *
 * ## Grid
 *
 * Rows are weekdays starting Monday (ISO 8601, and the week Vietnamese
 * calendars print). Columns are weeks, oldest left. Days before the window
 * exist as blanks so the first column keeps its weekday alignment — without
 * them every row would be off by however many days the window happened to start
 * into the week.
 *
 * @phase R535 — activity heatmap
 */
import { IconCalendar } from '@tabler/icons-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ActivityDay, useActivityDaily } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

/** Ranges, shortest first — the wheel walks this list. */
const RANGES = [
  { key: '2w', days: 14 },
  { key: '1m', days: 30 },
  { key: '3m', days: 90 },
  { key: '6m', days: 182 },
  { key: '12m', days: 365 }
] as const;
const DEFAULT_RANGE = 4;

/**
 * R546: one place the geometry is decided.
 *
 * The rail, the grid and the month labels all have to agree, and R537 proved
 * they will not agree by accident: month names went into `w-2.5` spans — a 45px
 * string in a 10px box — so they spilled over each other and printed "Tháng 8"
 * twice with no September between. The rail was a sibling of [months + grid], so
 * it started at the month row and pointed at the wrong lines. Both were me
 * reasoning about a layout instead of measuring it.
 */
const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const RAIL_W = 28;

/**
 * Five steps, like GitHub — enough to read a gradient, few enough that two
 * adjacent levels are actually distinguishable. §5: the chart palette, never
 * the status palette. The blue that means "running" elsewhere on this page must
 * not also mean "three things happened".
 */
const LEVELS = [
  'bg-muted',
  'bg-[var(--chart-1)]/25',
  'bg-[var(--chart-1)]/50',
  'bg-[var(--chart-1)]/75',
  'bg-[var(--chart-1)]'
];

/**
 * Quartiles of the non-zero days, not of the range.
 *
 * Slicing max/4 makes the scale a hostage of one outlier: a single day with 40
 * runs pushes every ordinary day into level 1, and the map reads as an empty
 * lab that had one good afternoon. Ranking the days that actually happened
 * keeps the gradient about this lab's own normal.
 */
function makeScale(totals: number[]): (n: number) => number {
  const active = totals.filter((n) => n > 0).toSorted((a, b) => a - b);
  if (active.length === 0) return () => 0;
  const at = (q: number) => active[Math.min(active.length - 1, Math.floor(active.length * q))];
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  return (n: number) => {
    if (n <= 0) return 0;
    if (n <= q1) return 1;
    if (n <= q2) return 2;
    if (n <= q3) return 3;
    return 4;
  };
}

type Cell = { day: ActivityDay; total: number } | null;

/** Monday = 0. getDay() is Sunday-based, which would put Sunday in row one. */
function isoWeekday(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

/** Last day of a month, local — where the window ends when you pick that month. */
function endOfMonth(year: number, month: number): number {
  const d = new Date(year, month + 1, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function ActivityHeatmap() {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const [rangeIdx, setRangeIdx] = useState(DEFAULT_RANGE);
  /** undefined = ends today, and keeps ending today as the clock moves. */
  const [endMs, setEndMs] = useState<number | undefined>(undefined);
  const wheelLock = useRef(0);

  const range = RANGES[rangeIdx];
  const { data, isLoading } = useActivityDaily(range.days, endMs);

  /**
   * A trackpad emits dozens of wheel events per flick. Ungated, one gesture
   * crosses all five ranges and lands wherever the momentum ran out — that is
   * not a control, it is a slot machine.
   */
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY === 0) return;
    const now = Date.now();
    if (now - wheelLock.current < 220) return;
    wheelLock.current = now;
    // Up = less time. Scrolling up moves toward now, and now is the shorter view.
    setRangeIdx((i) => Math.max(0, Math.min(RANGES.length - 1, i + (e.deltaY < 0 ? -1 : 1))));
  }, []);

  const { columns, scale, total, months } = useMemo(() => {
    const totals = data.map((d) => d.experiments + d.dft + d.samples);
    const cells: Cell[] = data.map((d, i) => ({ day: d, total: totals[i] }));
    const lead = data.length > 0 ? isoWeekday(data[0].iso) : 0;
    const padded: Cell[] = [...(Array(lead).fill(null) as Cell[]), ...cells];
    while (padded.length % 7 !== 0) padded.push(null);
    const cols: Cell[][] = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));

    // One label per month, at the column its first day lands in — recorded as an
    // index, not laid out in the flow, so a long name cannot shove the grid.
    const seen = new Set<string>();
    const labels: { ci: number; iso: string }[] = [];
    cols.forEach((col, ci) => {
      const first = col.find((c) => c !== null);
      if (!first) return;
      const key = first.day.iso.slice(0, 7);
      if (seen.has(key)) return;
      seen.add(key);
      labels.push({ ci, iso: first.day.iso });
    });

    return {
      columns: cols,
      scale: makeScale(totals),
      total: totals.reduce((a, b) => a + b, 0),
      months: labels
    };
  }, [data]);

  const now = new Date();
  const years = [0, 1, 2].map((i) => now.getFullYear() - i);
  const activeYear = endMs ? new Date(endMs).getFullYear() : now.getFullYear();
  const activeMonth = endMs ? new Date(endMs).getMonth() : null;

  return (
    <Panel
      title={t('activity.title')}
      description={t(`activity.range.${range.key}`)}
      action={
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-meta tabular-nums'>
            {t('activity.total', { count: total })}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size='sm'
                variant={endMs === undefined ? 'ghost' : 'secondary'}
                className='h-7 gap-1.5 rounded-lg'
              >
                <IconCalendar className='size-4' aria-hidden />
                {endMs === undefined
                  ? t('activity.periodNow')
                  : format.dateTime(new Date(endMs), { month: 'short', year: 'numeric' })}
              </Button>
            </PopoverTrigger>
            <PopoverContent align='end' className='w-64 p-3'>
              <div className='space-y-3'>
                <div className='flex gap-1'>
                  {years.map((y) => (
                    <Button
                      key={y}
                      size='sm'
                      variant={activeYear === y && endMs !== undefined ? 'default' : 'outline'}
                      className='h-7 flex-1 rounded-md px-0 tabular-nums'
                      onClick={() => setEndMs(endOfMonth(y, activeMonth ?? now.getMonth()))}
                    >
                      {y}
                    </Button>
                  ))}
                </div>
                <div className='grid grid-cols-4 gap-1'>
                  {Array.from({ length: 12 }, (_, m) => (
                    <Button
                      key={m}
                      size='sm'
                      variant={activeMonth === m && endMs !== undefined ? 'default' : 'ghost'}
                      className='h-7 rounded-md px-0'
                      onClick={() => setEndMs(endOfMonth(activeYear, m))}
                    >
                      {format.dateTime(new Date(2000, m, 1), { month: 'short' })}
                    </Button>
                  ))}
                </div>
                {/* Back to "now" as a rule, not as today's date — pinning the
                    end to this morning would go stale by tomorrow. */}
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 w-full rounded-md'
                  onClick={() => setEndMs(undefined)}
                >
                  {t('activity.periodNow')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className='h-[var(--panel-viewport)] w-full' />
      ) : (
        <div
          onWheel={onWheel}
          className='flex h-full min-h-[var(--panel-viewport)] flex-col justify-center gap-2'
        >
          {total === 0 ? (
            <PanelEmpty title={t('activity.emptyTitle')} description={t('activity.empty')} />
          ) : (
            <>
              {/* Month row, offset by the rail so column 0 sits over cell 0.
                  Labels are absolute: their width is nobody else's problem. */}
              <div
                className='text-muted-foreground text-meta relative h-4'
                style={{ marginLeft: RAIL_W }}
              >
                {months.map((m) => (
                  <span
                    key={m.iso}
                    aria-hidden='true'
                    className='absolute top-0 whitespace-nowrap'
                    style={{ left: m.ci * STEP }}
                  >
                    {format.dateTime(new Date(`${m.iso}T00:00:00`), { month: 'short' })}
                  </span>
                ))}
              </div>

              {/* Rail and grid in one row — they cannot drift apart. */}
              <div className='flex'>
                <div
                  className='text-muted-foreground text-meta flex shrink-0 flex-col'
                  style={{ width: RAIL_W, gap: GAP }}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                    <span
                      key={r}
                      aria-hidden='true'
                      className='flex items-center leading-none'
                      style={{ height: CELL }}
                    >
                      {r % 2 === 0 && r < 6 ? t(`activity.weekday.${r}`) : ''}
                    </span>
                  ))}
                </div>

                <div className='flex overflow-x-auto' style={{ gap: GAP }}>
                  {columns.map((col, ci) => (
                    <div key={ci} className='flex shrink-0 flex-col' style={{ gap: GAP }}>
                      {col.map((cell, ri) =>
                        cell === null ? (
                          <div key={ri} style={{ width: CELL, height: CELL }} aria-hidden='true' />
                        ) : (
                          <Tooltip key={cell.day.iso}>
                            <TooltipTrigger asChild>
                              <div
                                style={{ width: CELL, height: CELL }}
                                className={cn(
                                  'rounded-[3px] transition-transform hover:scale-125',
                                  LEVELS[scale(cell.total)]
                                )}
                              />
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                              <p className='font-medium'>
                                {format.dateTime(new Date(`${cell.day.iso}T00:00:00`), {
                                  weekday: 'short',
                                  day: '2-digit',
                                  month: '2-digit'
                                })}
                              </p>
                              {cell.total === 0 ? (
                                <p className='text-muted-foreground'>{t('activity.nothing')}</p>
                              ) : (
                                <p className='tabular-nums'>
                                  {t('activity.breakdown', {
                                    experiments: cell.day.experiments,
                                    dft: cell.day.dft,
                                    samples: cell.day.samples
                                  })}
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-1 flex items-center justify-between'>
                <span className='text-muted-foreground text-meta'>{t('activity.wheelHint')}</span>
                <div className='text-muted-foreground text-meta flex items-center gap-1'>
                  <span>{t('activity.less')}</span>
                  {LEVELS.map((cls) => (
                    <span
                      key={cls}
                      style={{ width: CELL, height: CELL }}
                      className={cn('rounded-[3px]', cls)}
                      aria-hidden='true'
                    />
                  ))}
                  <span>{t('activity.more')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
