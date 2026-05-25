'use client';

/**
 * BookingTimeline (R214 / ADR-038) — Day grid: hours (rows) × equipment (cols).
 * Layer 1: static render only. Blocks positioned by startAt/endAt. No drag yet.
 * Drag/resize/conflict come in later layers.
 */
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/lib/auth/use-claims';
import { useBookings } from '@/lib/firestore/queries/bookings';
import { useEquipmentList } from '@/lib/firestore/queries/equipment';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const SLOT_MIN = 30;
const ROW_H = 28; // px per 30-min slot
const SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MIN;

const statusColor: Record<string, string> = {
  pending: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300',
  approved: 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300',
  in_progress: 'bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300',
  completed: 'bg-green-500/15 border-green-500/40 text-green-700 dark:text-green-300',
  cancelled: 'bg-muted border-border text-muted-foreground line-through'
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function BookingTimeline() {
  const t = useTranslations('bookings');
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const { bookings, loading: bLoading } = useBookings();
  const { equipment, loading: eLoading } = useEquipmentList();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));

  if (bLoading || eLoading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const dayStart = startOfDay(day).getTime();
  const gridTop = dayStart + DAY_START_HOUR * 60 * 60 * 1000;

  // bookings that fall on this day, grouped by equipment
  const dayBookings = bookings.filter(
    (b) =>
      b.status !== 'cancelled' && b.endAt > gridTop && b.startAt < dayStart + DAY_END_HOUR * 3600000
  );

  const blockFor = (startAt: number, endAt: number) => {
    const clampedStart = Math.max(startAt, gridTop);
    const clampedEnd = Math.min(endAt, dayStart + DAY_END_HOUR * 3600000);
    const top = ((clampedStart - gridTop) / (SLOT_MIN * 60000)) * ROW_H;
    const height = Math.max(((clampedEnd - clampedStart) / (SLOT_MIN * 60000)) * ROW_H, 18);
    return { top, height };
  };

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const dateLabel = day.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <div className='space-y-3'>
      {/* day navigation */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={t('prevDay')}
            onClick={() => setDay((d) => new Date(d.getTime() - 86400000))}
          >
            <IconChevronLeft className='size-4' />
          </Button>
          <Button variant='outline' size='sm' onClick={() => setDay(startOfDay(new Date()))}>
            {t('today')}
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={t('nextDay')}
            onClick={() => setDay((d) => new Date(d.getTime() + 86400000))}
          >
            <IconChevronRight className='size-4' />
          </Button>
        </div>
        <span className='text-sm font-medium capitalize'>{dateLabel}</span>
      </div>

      {equipment.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('empty')}</div>
      ) : (
        <div className='overflow-x-auto rounded-lg border'>
          <div className='flex min-w-max'>
            {/* hour gutter */}
            <div className='shrink-0 border-r bg-muted/30'>
              <div className='h-8 border-b' /> {/* header spacer */}
              {hours.map((h) => (
                <div
                  key={h}
                  className='text-muted-foreground border-b px-2 text-right text-[10px] tabular-nums'
                  style={{ height: ROW_H * 2 }}
                >
                  {fmtHour(h)}
                </div>
              ))}
            </div>

            {/* equipment columns */}
            {equipment.map((eq) => {
              const colBookings = dayBookings.filter((b) => b.equipmentId === eq.id);
              return (
                <div key={eq.id} className='relative w-44 shrink-0 border-r last:border-r-0'>
                  {/* column header */}
                  <div className='bg-muted/30 flex h-8 items-center justify-center border-b px-2 text-xs font-medium'>
                    <span className='truncate'>{eq.name}</span>
                  </div>
                  {/* slot grid lines */}
                  <div className='relative' style={{ height: SLOTS * ROW_H }}>
                    {Array.from({ length: SLOTS }, (_, i) => (
                      <div
                        key={i}
                        className={`border-b ${i % 2 === 1 ? 'border-border' : 'border-border/40'}`}
                        style={{ height: ROW_H }}
                      />
                    ))}
                    {/* booking blocks */}
                    {colBookings.map((b) => {
                      const { top, height } = blockFor(b.startAt, b.endAt);
                      return (
                        <div
                          key={b.id}
                          className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[10px] leading-tight ${statusColor[b.status] ?? 'bg-muted border-border'}`}
                          style={{ top, height }}
                          title={`${b.userName ?? ''} — ${b.purpose}`}
                        >
                          <div className='truncate font-medium'>{b.userName ?? '—'}</div>
                          <div className='truncate opacity-80'>{b.purpose}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isAdmin && <p className='text-muted-foreground text-xs'>{t('timelineReadonly')}</p>}
    </div>
  );
}
