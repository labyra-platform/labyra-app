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
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Panel, PanelEmpty } from '@/components/ui-extra/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ActivityDay, useActivityDaily } from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';

/**
 * A year, because that is what "like GitHub" means and because twelve weeks did
 * not fill the card.
 *
 * R535 picked 12 for pattern legibility and never checked the width: 12 columns
 * at 18px is 216px inside a 700px half-page card, so the graph read as a
 * fragment someone forgot to finish. 52 columns at 12px is 624px — it fills the
 * slot, and a year is the window where a heatmap actually earns its shape: you
 * can see a semester, a submission crunch, a month away from the bench.
 *
 * The query cost is unchanged; the hook reads the collection and buckets in
 * memory either way.
 */
const WEEKS = 52;
const DAYS = WEEKS * 7;

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

export function ActivityHeatmap() {
  const t = useTranslations('dashboard');
  const format = useFormatter();
  const { data, isLoading } = useActivityDaily(DAYS);

  const { columns, scale, total } = useMemo(() => {
    const totals = data.map((d) => d.experiments + d.dft + d.samples);
    const grand = totals.reduce((a, b) => a + b, 0);
    const cells: Cell[] = data.map((d, i) => ({ day: d, total: totals[i] }));

    // Pad the first column so row 0 is always Monday. Without this the grid
    // silently relabels itself whenever the window starts mid-week.
    const lead = data.length > 0 ? isoWeekday(data[0].iso) : 0;
    const padded: Cell[] = [...(Array(lead).fill(null) as Cell[]), ...cells];
    while (padded.length % 7 !== 0) padded.push(null);

    const cols: Cell[][] = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));

    return { columns: cols, scale: makeScale(totals), total: grand };
  }, [data]);

  return (
    <Panel
      title={t('activity.title')}
      description={t('activity.subtitle', { weeks: WEEKS })}
      action={
        <span className='text-muted-foreground text-meta tabular-nums'>
          {t('activity.total', { count: total })}
        </span>
      }
    >
      {isLoading ? (
        <Skeleton className='h-[var(--panel-viewport)] w-full' />
      ) : total === 0 ? (
        <div className='flex h-[var(--panel-viewport)] flex-col'>
          <PanelEmpty title={t('activity.emptyTitle')} description={t('activity.empty')} />
        </div>
      ) : (
        <div className='flex h-full min-h-[var(--panel-viewport)] flex-col justify-center gap-2'>
          <div className='flex gap-1 overflow-x-auto pb-1'>
            {/* Weekday rail. Mon/Wed/Fri only — labelling all seven turns the
                axis into a wall of text next to 10px squares, and three is
                enough to count from. aria-hidden because the cells carry the
                full date in their tooltip; a screen reader reading "T2" 52
                times has been told nothing. */}
            <div className='text-muted-foreground text-meta flex shrink-0 flex-col gap-0.5 pr-1'>
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <span key={r} aria-hidden='true' className='flex h-2.5 items-center leading-none'>
                  {r % 2 === 0 && r < 6 ? t(`activity.weekday.${r}`) : ''}
                </span>
              ))}
            </div>

            <div className='flex flex-col gap-1'>
              {/* Month labels, placed at the first column of each month. */}
              <div className='text-muted-foreground text-meta flex gap-0.5'>
                {columns.map((col, ci) => {
                  const first = col.find((c) => c !== null);
                  const isNewMonth =
                    first !== undefined &&
                    first !== null &&
                    (ci === 0 ||
                      first.day.iso.slice(5, 7) !==
                        (columns[ci - 1].find((c) => c !== null)?.day.iso.slice(5, 7) ?? ''));
                  return (
                    <span key={ci} aria-hidden='true' className='w-2.5 shrink-0 leading-none'>
                      {isNewMonth
                        ? format.dateTime(new Date(`${first.day.iso}T00:00:00`), { month: 'short' })
                        : ''}
                    </span>
                  );
                })}
              </div>

              <div className='flex gap-0.5'>
                {columns.map((col, ci) => (
                  // Columns are positional — a week has no id, and the window
                  // shifts by one every midnight, so an index key is honest.
                  <div key={ci} className='flex shrink-0 flex-col gap-0.5'>
                    {col.map((cell, ri) =>
                      cell === null ? (
                        <div key={ri} className='size-2.5' aria-hidden='true' />
                      ) : (
                        <Tooltip key={cell.day.iso}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'size-2.5 rounded-[2px] transition-transform hover:scale-150',
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
                              // The three series the grid had to merge. Not gone
                              // — one hover away.
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
          </div>

          <div className='text-muted-foreground text-meta flex items-center justify-end gap-1'>
            <span>{t('activity.less')}</span>
            {LEVELS.map((cls) => (
              <span key={cls} className={cn('size-2.5 rounded-[2px]', cls)} aria-hidden='true' />
            ))}
            <span>{t('activity.more')}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
