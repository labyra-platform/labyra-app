'use client';

/**
 * BookingTimeline (R214 / ADR-038) — final.
 * - Day view: equipment (cols) × hours. Drag (startAt) + resize (endAt), admin.
 * - Week view: 7 days (cols) × hours, ONE equipment (dropdown). Read-only.
 * - Google-Calendar-style blocks (time + name + purpose, left status border).
 * - Client-only date state (no hydration mismatch). Current-time line.
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
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useIsAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { useBookings } from '@/lib/firestore/queries/bookings';
import { useEquipmentList } from '@/lib/firestore/queries/equipment';
import type { Booking } from '@/types/bookings';

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;
const SLOT_MIN = 30;
const ROW_H = 30;
const SLOTS = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MIN;
const SLOT_MS = SLOT_MIN * 60000;
const GUTTER_W = 56;
const MIN_MS = SLOT_MS;
const DAY_MS = 86400000;

// Google-Calendar-style soft pastel fills, no heavy border, dark readable text.
// Google-Calendar-style SOLID pastel fills (no transparency), dark readable text.
const statusStyle: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-50',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-50',
  in_progress: 'bg-sky-100 text-sky-900 dark:bg-sky-900/60 dark:text-sky-50',
  completed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  cancelled: 'bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500'
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  return x;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function blockFor(startAt: number, endAt: number, gTop: number, gBottom: number) {
  const cs = Math.max(startAt, gTop);
  const ce = Math.min(endAt, gBottom);
  const top = ((cs - gTop) / SLOT_MS) * ROW_H;
  const height = Math.max(((ce - cs) / SLOT_MS) * ROW_H - 2, 18);
  return { top, height };
}

/** Block content (Google-style): title (user) bold first, time muted, purpose. */
function BlockBody({ booking, height }: { booking: Booking; height: number }) {
  const title = booking.userName?.trim() || booking.purpose?.trim() || '—';
  const showPurpose = height > 44 && booking.purpose?.trim() && booking.userName?.trim();
  return (
    <>
      <div className='truncate font-semibold'>{title}</div>
      <div className='truncate text-[10px] font-normal opacity-75'>
        {fmtClock(booking.startAt)}–{fmtClock(booking.endAt)}
      </div>
      {showPurpose && <div className='truncate text-[10px] opacity-60'>{booking.purpose}</div>}
    </>
  );
}

/** Draggable + resizable block (Day view). */
function DayBlock({
  booking,
  top,
  height,
  draggable,
  onResize
}: {
  booking: Booking;
  top: number;
  height: number;
  draggable: boolean;
  onResize: (b: Booking, deltaPx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    disabled: !draggable
  });
  const dy = transform ? transform.y : 0;
  const resizing = useRef(false);
  const startY = useRef(0);
  const [previewDelta, setPreviewDelta] = useState(0);

  function onHandleDown(e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandleMove(e: ReactPointerEvent) {
    if (!resizing.current) return;
    setPreviewDelta(e.clientY - startY.current);
  }
  function onHandleUp(e: ReactPointerEvent) {
    if (!resizing.current) return;
    resizing.current = false;
    const d = e.clientY - startY.current;
    setPreviewDelta(0);
    if (Math.abs(d) >= 2) onResize(booking, d);
  }

  const effHeight = Math.max(height + previewDelta, 18);
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      className={`absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[11px] leading-tight transition-shadow ${statusStyle[booking.status] ?? 'bg-muted'} ${draggable ? 'cursor-grab active:cursor-grabbing hover:brightness-95' : ''} ${isDragging ? 'z-20 opacity-90 shadow-md' : ''}`}
      style={{ top: top + dy, height: effHeight }}
      title={`${booking.userName ?? ''} — ${booking.purpose}`}
    >
      <BlockBody booking={booking} height={effHeight} />
      {draggable && (
        <div
          className='absolute inset-x-0 bottom-0 h-2 cursor-ns-resize'
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
        >
          <div className='mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-30' />
        </div>
      )}
    </div>
  );
}

/** Static block (Week view, read-only). */
function WeekBlock({ booking, top, height }: { booking: Booking; top: number; height: number }) {
  return (
    <div
      className={`absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight ${statusStyle[booking.status] ?? 'bg-muted'}`}
      style={{ top, height }}
      title={`${booking.userName ?? ''} — ${booking.purpose}`}
    >
      <BlockBody booking={booking} height={height} />
    </div>
  );
}

function HourGutter() {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  return (
    <div className='bg-muted/20 shrink-0 border-r' style={{ width: GUTTER_W }}>
      <div className='h-9 border-b' />
      {hours.map((h) => (
        <div
          key={h}
          className='text-muted-foreground border-b pr-2 pt-0.5 text-right text-[10px] tabular-nums'
          style={{ height: ROW_H * 2 }}
        >
          {fmtHour(h)}
        </div>
      ))}
    </div>
  );
}

function SlotLines() {
  return (
    <>
      {Array.from({ length: SLOTS }, (_, i) => (
        <div
          key={i}
          className={`border-b ${i % 2 === 1 ? 'border-border/60' : 'border-border/25'}`}
          style={{ height: ROW_H }}
        />
      ))}
    </>
  );
}

export function BookingTimeline() {
  const t = useTranslations('bookings');
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const { bookings, loading: bLoading } = useBookings();
  const { equipment, loading: eLoading } = useEquipmentList();
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState<Date | undefined>(undefined);
  const [now, setNow] = useState<number | undefined>(undefined);
  const [weekEquip, setWeekEquip] = useState<string>('');
  const [pending, setPending] = useState<Record<string, { startAt: number; endAt: number }>>({});

  useEffect(() => {
    setAnchor(startOfDay(new Date()));
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (bLoading || eLoading || !anchor) {
    return <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>;
  }

  const effTime = (b: Booking) => pending[b.id] ?? { startAt: b.startAt, endAt: b.endAt };

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

  // ---- DAY view ----
  const dayStart = startOfDay(anchor).getTime();
  const dGridTop = dayStart + DAY_START_HOUR * 3600000;
  const dGridBottom = dayStart + DAY_END_HOUR * 3600000;

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
    newStart = Math.max(dGridTop, Math.min(newStart, dGridBottom - duration));
    if (newStart === startAt) return;
    void persist(b, newStart, newStart + duration);
  }

  function handleResize(b: Booking, deltaPx: number) {
    const { startAt, endAt } = effTime(b);
    const slotDelta = Math.round(deltaPx / ROW_H);
    if (slotDelta === 0) return;
    let newEnd = endAt + slotDelta * SLOT_MS;
    newEnd = Math.max(startAt + MIN_MS, Math.min(newEnd, dGridBottom));
    if (newEnd === endAt) return;
    void persist(b, startAt, newEnd);
  }

  const isToday = startOfDay(new Date()).getTime() === dayStart;
  const nowTop =
    now && isToday && now >= dGridTop && now <= dGridBottom
      ? ((now - dGridTop) / SLOT_MS) * ROW_H
      : null;

  const dayLabel = anchor.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  // ---- WEEK view ----
  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const activeEquip = weekEquip || equipment[0]?.id || '';
  const weekLabel = `${weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const step = (dir: number) => {
    setAnchor((d) => {
      const base = d ?? new Date();
      return new Date(base.getTime() + dir * (mode === 'week' ? 7 * DAY_MS : DAY_MS));
    });
  };

  return (
    <div className='space-y-3'>
      {/* controls */}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={t('prevDay')}
            onClick={() => step(-1)}
          >
            <IconChevronLeft className='size-4' />
          </Button>
          <Button variant='outline' size='sm' onClick={() => setAnchor(startOfDay(new Date()))}>
            {t('today')}
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={t('nextDay')}
            onClick={() => step(1)}
          >
            <IconChevronRight className='size-4' />
          </Button>
          <span className='ml-2 text-sm font-medium capitalize'>
            {mode === 'day' ? dayLabel : weekLabel}
          </span>
        </div>

        <div className='flex items-center gap-2'>
          {mode === 'week' && equipment.length > 0 && (
            <Select value={activeEquip} onValueChange={setWeekEquip}>
              <SelectTrigger className='h-8 w-44 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {equipment.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>
                    {eq.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className='flex gap-1'>
            <Button
              variant={mode === 'day' ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setMode('day')}
            >
              {t('viewDay')}
            </Button>
            <Button
              variant={mode === 'week' ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setMode('week')}
            >
              {t('viewWeek')}
            </Button>
          </div>
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border py-12 text-center text-sm'>
          {t('empty')}
        </div>
      ) : mode === 'day' ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className='overflow-hidden rounded-lg border'>
            <div className='flex'>
              <HourGutter />
              <div className='flex flex-1'>
                {equipment.map((eq) => {
                  const colBookings = bookings.filter((b) => {
                    const { startAt, endAt } = effTime(b);
                    return (
                      b.equipmentId === eq.id &&
                      b.status !== 'cancelled' &&
                      endAt > dGridTop &&
                      startAt < dGridBottom
                    );
                  });
                  return (
                    <div key={eq.id} className='relative min-w-0 flex-1 border-r last:border-r-0'>
                      <div className='bg-muted/20 flex h-9 items-center justify-center border-b px-2 text-xs font-semibold'>
                        <span className='truncate'>{eq.name}</span>
                      </div>
                      <div className='relative' style={{ height: SLOTS * ROW_H }}>
                        <SlotLines />
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
                          const { top, height } = blockFor(startAt, endAt, dGridTop, dGridBottom);
                          return (
                            <DayBlock
                              key={b.id}
                              booking={b}
                              top={top}
                              height={height}
                              draggable={isAdmin}
                              onResize={handleResize}
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
      ) : (
        <div className='overflow-hidden rounded-lg border'>
          <div className='flex'>
            <HourGutter />
            <div className='flex flex-1'>
              {weekDays.map((wd) => {
                const wdStart = wd.getTime();
                const gTop = wdStart + DAY_START_HOUR * 3600000;
                const gBottom = wdStart + DAY_END_HOUR * 3600000;
                const isWtoday = startOfDay(new Date()).getTime() === wdStart;
                const colBookings = bookings.filter((b) => {
                  return (
                    b.equipmentId === activeEquip &&
                    b.status !== 'cancelled' &&
                    b.endAt > gTop &&
                    b.startAt < gBottom
                  );
                });
                return (
                  <div key={wdStart} className='relative min-w-0 flex-1 border-r last:border-r-0'>
                    <div
                      className={`flex h-9 flex-col items-center justify-center border-b text-[10px] ${isWtoday ? 'bg-primary/10 font-semibold' : 'bg-muted/20'}`}
                    >
                      <span className='uppercase'>
                        {wd.toLocaleDateString(locale, { weekday: 'short' })}
                      </span>
                      <span className='tabular-nums'>{wd.getDate()}</span>
                    </div>
                    <div className='relative' style={{ height: SLOTS * ROW_H }}>
                      <SlotLines />
                      {colBookings.map((b) => {
                        const { top, height } = blockFor(b.startAt, b.endAt, gTop, gBottom);
                        return <WeekBlock key={b.id} booking={b} top={top} height={height} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!isAdmin && <p className='text-muted-foreground text-xs'>{t('timelineReadonly')}</p>}
    </div>
  );
}
