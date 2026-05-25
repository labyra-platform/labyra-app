'use client';

/**
 * BookingTimeline (R214 / ADR-038) — Day grid: hours (rows) × equipment (cols).
 * Layer 2 + polish (R214-3): drag to reschedule startAt; redesigned grid;
 * client-only day state (fixes hydration #419); current-time line.
 */
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useBookings } from '@/lib/firestore/queries/bookings';
import { useEquipmentList } from '@/lib/firestore/queries/equipment';
import type { Booking } from '@/types/bookings';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const SLOT_MIN = 30;
const ROW_H = 30; // px per 30-min slot
const SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MIN;
const SLOT_MS = SLOT_MIN * 60000;
const GUTTER_W = 56; // px

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-500/15 border-l-amber-500 text-amber-900 dark:text-amber-200',
  approved: 'bg-blue-500/15 border-l-blue-500 text-blue-900 dark:text-blue-200',
  in_progress: 'bg-violet-500/15 border-l-violet-500 text-violet-900 dark:text-violet-200',
  completed: 'bg-green-500/15 border-l-green-500 text-green-900 dark:text-green-200',
  cancelled: 'bg-muted border-l-border text-muted-foreground line-through'
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

/** Draggable booking block (vertical only). */
function DraggableBlock({
  booking,
  top,
  height,
  draggable
}: {
  booking: Booking;
  top: number;
  height: number;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    disabled: !draggable
  });
  const dy = transform ? transform.y : 0;
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      className={`absolute inset-x-1.5 overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-[11px] leading-tight shadow-sm transition-shadow ${statusStyle[booking.status] ?? 'bg-muted border-l-border'} ${draggable ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''} ${isDragging ? 'z-20 opacity-90 shadow-lg ring-2 ring-primary/40' : ''}`}
      style={{ top: top + dy, height }}
      title={`${booking.userName ?? ''} — ${booking.purpose}`}
    >
      <div className='truncate font-semibold'>{booking.userName ?? '—'}</div>
      {height > 26 && <div className='truncate opacity-75'>{booking.purpose}</div>}
    </div>
  );
}

export function BookingTimeline() {
  const t = useTranslations('bookings');
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const { bookings, loading: bLoading } = useBookings();
  const { equipment, loading: eLoading } = useEquipmentList();
  // client-only: undefined on server -> avoids hydration mismatch (#419)
  const [day, setDay] = useState<Date | undefined>(undefined);
  const [now, setNow] = useState<number | undefined>(undefined);
  const [pending, setPending] = useState<Record<string, { startAt: number; endAt: number }>>({});

  useEffect(() => {
    setDay(startOfDay(new Date()));
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (bLoading || eLoading || !day) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const dayStart = startOfDay(day).getTime();
  const gridTop = dayStart + DAY_START_HOUR * 3600000;
  const gridBottom = dayStart + DAY_END_HOUR * 3600000;

  const effTime = (b: Booking) => pending[b.id] ?? { startAt: b.startAt, endAt: b.endAt };

  const dayBookings = bookings.filter((b) => {
    const { startAt, endAt } = effTime(b);
    return b.status !== 'cancelled' && endAt > gridTop && startAt < gridBottom;
  });

  const blockFor = (startAt: number, endAt: number) => {
    const clampedStart = Math.max(startAt, gridTop);
    const clampedEnd = Math.min(endAt, gridBottom);
    const top = ((clampedStart - gridTop) / SLOT_MS) * ROW_H;
    const height = Math.max(((clampedEnd - clampedStart) / SLOT_MS) * ROW_H - 2, 18);
    return { top, height };
  };

  async function persist(b: Booking, startAt: number, endAt: number) {
    setPending((p) => ({ ...p, [b.id]: { startAt, endAt } }));
    const clear = () =>
      setPending((p) => {
        const next = { ...p };
        delete next[b.id];
        return next;
      });
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('not_authenticated');
      const token = await user.getIdToken();
      const res = await fetch(`/api/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startAt, endAt })
      });
      if (!res.ok) {
        toast.error(res.status === 409 ? t('timelineConflict') : await res.text());
        clear();
        return;
      }
      toast.success(t('toastUpdated'));
      setTimeout(clear, 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
      clear();
    }
  }

  function handleDragEnd(ev: DragEndEvent) {
    const dy = ev.delta.y;
    if (Math.abs(dy) < 2) return;
    const b = bookings.find((x) => x.id === ev.active.id);
    if (!b) return;
    const { startAt, endAt } = effTime(b);
    const duration = endAt - startAt;
    const slotDelta = Math.round(dy / ROW_H);
    if (slotDelta === 0) return;
    let newStart = startAt + slotDelta * SLOT_MS;
    newStart = Math.max(gridTop, Math.min(newStart, gridBottom - duration));
    if (newStart === startAt) return;
    void persist(b, newStart, newStart + duration);
  }

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const dateLabel = day.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const isToday = startOfDay(new Date()).getTime() === dayStart;
  const nowTop =
    now && isToday && now >= gridTop && now <= gridBottom
      ? ((now - gridTop) / SLOT_MS) * ROW_H
      : null;

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={t('prevDay')}
            onClick={() => setDay((d) => new Date((d ?? new Date()).getTime() - 86400000))}
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
            onClick={() => setDay((d) => new Date((d ?? new Date()).getTime() + 86400000))}
          >
            <IconChevronRight className='size-4' />
          </Button>
        </div>
        <span className='text-sm font-medium capitalize'>{dateLabel}</span>
      </div>

      {equipment.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border py-12 text-center text-sm'>
          {t('empty')}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className='overflow-hidden rounded-lg border'>
            <div className='flex'>
              {/* hour gutter */}
              <div className='bg-muted/20 shrink-0 border-r' style={{ width: GUTTER_W }}>
                <div className='h-9 border-b' />
                {hours.map((h) => (
                  <div
                    key={h}
                    className='text-muted-foreground relative border-b px-1.5 text-right text-[10px] tabular-nums'
                    style={{ height: ROW_H * 2 }}
                  >
                    <span className='absolute -top-1.5 right-1.5'>{fmtHour(h)}</span>
                  </div>
                ))}
              </div>

              {/* equipment columns — flex-1 chia đều full width */}
              <div className='flex flex-1'>
                {equipment.map((eq) => {
                  const colBookings = dayBookings.filter((b) => b.equipmentId === eq.id);
                  return (
                    <div key={eq.id} className='relative min-w-0 flex-1 border-r last:border-r-0'>
                      <div className='bg-muted/20 flex h-9 items-center justify-center border-b px-2 text-xs font-semibold'>
                        <span className='truncate'>{eq.name}</span>
                      </div>
                      <div className='relative' style={{ height: SLOTS * ROW_H }}>
                        {Array.from({ length: SLOTS }, (_, i) => (
                          <div
                            key={i}
                            className={`border-b ${i % 2 === 1 ? 'border-border/60' : 'border-border/25'}`}
                            style={{ height: ROW_H }}
                          />
                        ))}
                        {nowTop !== null && (
                          <div
                            className='pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500'
                            style={{ top: nowTop }}
                          >
                            <span className='absolute -left-0 -top-1 size-2 rounded-full bg-red-500' />
                          </div>
                        )}
                        {colBookings.map((b) => {
                          const { startAt, endAt } = effTime(b);
                          const { top, height } = blockFor(startAt, endAt);
                          return (
                            <DraggableBlock
                              key={b.id}
                              booking={b}
                              top={top}
                              height={height}
                              draggable={isAdmin}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {!isAdmin && <p className='text-muted-foreground text-xs'>{t('timelineReadonly')}</p>}
    </div>
  );
}
