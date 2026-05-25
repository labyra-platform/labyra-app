'use client';

/**
 * BookingTimeline (R214 / ADR-038) — Day grid: hours (rows) × equipment (cols).
 * Layer 2: drag a block vertically to change startAt (keeps duration), snap 30',
 * optimistic PATCH with revert on error. Admin only; others read-only.
 * Resize (layer 3) and conflict-409 handling (layer 4) come next.
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
import { useState } from 'react';
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
const ROW_H = 28; // px per 30-min slot
const SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MIN;
const SLOT_MS = SLOT_MIN * 60000;

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
      className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[10px] leading-tight ${statusColor[booking.status] ?? 'bg-muted border-border'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'z-20 opacity-80 shadow-lg' : ''}`}
      style={{ top: top + dy, height }}
      title={`${booking.userName ?? ''} — ${booking.purpose}`}
    >
      <div className='truncate font-medium'>{booking.userName ?? '—'}</div>
      <div className='truncate opacity-80'>{booking.purpose}</div>
    </div>
  );
}

export function BookingTimeline() {
  const t = useTranslations('bookings');
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const { bookings, loading: bLoading } = useBookings();
  const { equipment, loading: eLoading } = useEquipmentList();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [pending, setPending] = useState<Record<string, { startAt: number; endAt: number }>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (bLoading || eLoading) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const dayStart = startOfDay(day).getTime();
  const gridTop = dayStart + DAY_START_HOUR * 60 * 60 * 1000;
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
    const height = Math.max(((clampedEnd - clampedStart) / SLOT_MS) * ROW_H, 18);
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

  return (
    <div className='space-y-3'>
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className='overflow-x-auto rounded-lg border'>
            <div className='flex min-w-max'>
              <div className='shrink-0 border-r bg-muted/30'>
                <div className='h-8 border-b' />
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

              {equipment.map((eq) => {
                const colBookings = dayBookings.filter((b) => b.equipmentId === eq.id);
                return (
                  <div key={eq.id} className='relative w-44 shrink-0 border-r last:border-r-0'>
                    <div className='bg-muted/30 flex h-8 items-center justify-center border-b px-2 text-xs font-medium'>
                      <span className='truncate'>{eq.name}</span>
                    </div>
                    <div className='relative' style={{ height: SLOTS * ROW_H }}>
                      {Array.from({ length: SLOTS }, (_, i) => (
                        <div
                          key={i}
                          className={`border-b ${i % 2 === 1 ? 'border-border' : 'border-border/40'}`}
                          style={{ height: ROW_H }}
                        />
                      ))}
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
        </DndContext>
      )}

      {!isAdmin && <p className='text-muted-foreground text-xs'>{t('timelineReadonly')}</p>}
    </div>
  );
}
