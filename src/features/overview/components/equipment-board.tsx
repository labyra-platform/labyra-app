'use client';

/**
 * R507: today's equipment board.
 *
 * Instruments are shared across the whole lab, so the board shows every
 * group's bookings. Colour answers the question that follows: mine (act on
 * it), my group (ask a teammate to swap), another group (negotiate, or leave
 * alone). Bars are positioned proportionally across the working day, so an
 * hour looks like an hour and a clash is visible without reading a single
 * timestamp.
 *
 * Only instruments booked today get a row — an empty grid of every instrument
 * the lab owns tells you nothing.
 */
import { useTranslations } from 'next-intl';
import { useFeatureAllowed } from '@/hooks/use-feature-access';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/use-auth';
import {
  type BookingOwner,
  type ScheduledBooking,
  useTodaySchedule
} from '@/lib/firestore/queries/dashboard';
import { cn } from '@/lib/utils';
import { useGroupRoster } from '../use-group-roster';

/** Working day the board spans. Bookings outside it are clamped to the edges. */
const DAY_START_H = 8;
const DAY_END_H = 18;
const HOURS = DAY_END_H - DAY_START_H;

const OWNER_BAR: Record<BookingOwner, string> = {
  self: 'bg-chart-2 text-white',
  group: 'bg-chart-2/35 text-foreground',
  other: 'bg-muted-foreground/25 text-foreground'
};
const OWNER_DOT: Record<BookingOwner, string> = {
  self: 'bg-chart-2',
  group: 'bg-chart-2/35',
  other: 'bg-muted-foreground/25'
};

function hourOffset(ms: number, dayStart: number): number {
  return (ms - dayStart) / 3_600_000;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Bar({ booking, dayStart }: { booking: ScheduledBooking; dayStart: number }) {
  const from = Math.max(DAY_START_H, hourOffset(booking.startAt, dayStart));
  const to = Math.min(DAY_END_H, hourOffset(booking.endAt, dayStart));
  // A booking wholly outside the working window still deserves a hairline at
  // the edge rather than silently vanishing from the board.
  const left = ((from - DAY_START_H) / HOURS) * 100;
  const width = Math.max(((to - from) / HOURS) * 100, 1.5);

  return (
    <div
      className={cn(
        'absolute top-1 bottom-1 flex items-center overflow-hidden rounded px-1.5 text-[10px] font-medium',
        OWNER_BAR[booking.owner]
      )}
      style={{ left: `${Math.max(0, left)}%`, width: `${width}%` }}
      title={`${booking.equipmentName} · ${fmt(booking.startAt)}–${fmt(booking.endAt)}${
        booking.purpose ? ` · ${booking.purpose}` : ''
      }`}
    >
      <span className='truncate'>
        {fmt(booking.startAt)}
        {booking.continuesTomorrow ? ' →' : ''}
      </span>
    </div>
  );
}

function Legend({ owner, label }: { owner: BookingOwner; label: string }) {
  return (
    <span className='text-muted-foreground flex items-center gap-1 text-[10px]'>
      <span className={cn('size-2 rounded-[2px]', OWNER_DOT[owner])} aria-hidden />
      {label}
    </span>
  );
}

export function EquipmentBoard() {
  // R509: this whole card is about one feature — if it's off, it isn't here.
  const allowed = useFeatureAllowed('bookings');
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const { uids, isLoading: rosterLoading } = useGroupRoster();
  const { rows, totalEquipment, isLoading } = useTodaySchedule(user?.uid, uids);

  if (allowed === false) return null;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const ticks = Array.from({ length: HOURS / 2 + 1 }, (_, i) => DAY_START_H + i * 2);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Icons.calendar className='size-4' aria-hidden />
            {t('board.title')}
          </CardTitle>
          <div className='flex items-center gap-3'>
            <Legend owner='self' label={t('board.self')} />
            <Legend owner='group' label={t('board.group')} />
            <Legend owner='other' label={t('board.other')} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || rosterLoading ? (
          <div className='space-y-2'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-6 w-full' />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>{t('board.empty')}</p>
        ) : (
          <div className='space-y-1.5'>
            <div className='flex pl-24'>
              <div className='relative h-4 flex-1'>
                {ticks.map((h) => (
                  <span
                    key={h}
                    className='text-muted-foreground absolute -translate-x-1/2 text-[10px] tabular-nums'
                    style={{ left: `${((h - DAY_START_H) / HOURS) * 100}%` }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((row) => (
              <div key={row.equipmentName} className='flex items-center gap-2'>
                <span
                  className='text-muted-foreground w-24 shrink-0 truncate text-xs'
                  title={row.equipmentName}
                >
                  {row.equipmentName}
                </span>
                <div className='bg-muted/40 relative h-7 flex-1 rounded'>
                  {row.bookings.map((b) => (
                    <Bar key={b.id} booking={b} dayStart={dayStart.getTime()} />
                  ))}
                </div>
              </div>
            ))}
            <p className='text-muted-foreground pt-1 text-[11px]'>
              {t('board.footnote', { booked: rows.length, total: totalEquipment })}{' '}
              <Link href='/dashboard/bookings' className='underline underline-offset-2'>
                {t('board.viewAll')}
              </Link>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
