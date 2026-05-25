'use client';

/**
 * BookingTimeline (R214 / ADR-038) — Week-only grid.
 * 7 days (cols) × hours, ONE equipment (dropdown). Drag (startAt) + resize
 * (endAt) per day-column: vertical drag changes time within that day (keeps
 * the day; change the day via the form). Admin only; others read-only.
 * Google-Calendar-style solid pastel blocks. Client-only date (no hydration).
 */
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
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
const BIZ_START_HOUR = 8;
const BIZ_END_HOUR = 18;

// Google-Calendar-style SOLID pastel fills, dark readable text.
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

function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function sameDay(a: number, b: number): boolean {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtFull(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function blockFor(startAt: number, endAt: number, gTop: number, gBottom: number) {
  const cs = Math.max(startAt, gTop);
  const ce = Math.min(endAt, gBottom);
  const top = ((cs - gTop) / SLOT_MS) * ROW_H;
  const height = Math.max(((ce - cs) / SLOT_MS) * ROW_H - 2, 18);
  return { top, height };
}

/** Block content (Google-style): title (user) bold, time muted, purpose. */
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

/** Draggable + resizable block. */
function DayBlock({
  booking,
  top,
  height,
  draggable,
  onResize,
  onResizeTop,
  locale,
  statusLabel
}: {
  booking: Booking;
  top: number;
  height: number;
  draggable: boolean;
  onResize: (b: Booking, deltaPx: number) => void;
  onResizeTop: (b: Booking, deltaPx: number) => void;
  locale: string;
  statusLabel: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: booking.id,
    disabled: !draggable
  });
  const resizeEdge = useRef<'top' | 'bottom' | null>(null);
  const startY = useRef(0);
  const [previewDelta, setPreviewDelta] = useState(0);

  function makeDown(edge: 'top' | 'bottom') {
    return (e: ReactPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      resizeEdge.current = edge;
      startY.current = e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function onHandleMove(e: ReactPointerEvent) {
    if (!resizeEdge.current) return;
    setPreviewDelta(e.clientY - startY.current);
  }
  function onHandleUp(e: ReactPointerEvent) {
    const edge = resizeEdge.current;
    if (!edge) return;
    resizeEdge.current = null;
    const d = e.clientY - startY.current;
    setPreviewDelta(0);
    if (Math.abs(d) < 2) return;
    if (edge === 'bottom') onResize(booking, d);
    else onResizeTop(booking, d);
  }

  // top edge: shift top down + shrink height; bottom edge: grow height.
  const isTop = resizeEdge.current === 'top';
  const effTop = isTop ? top + previewDelta : top;
  const effHeight = isTop
    ? Math.max(height - previewDelta, 18)
    : Math.max(height + previewDelta, 18);
  const block = (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      className={`absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[11px] leading-tight transition-shadow ${statusStyle[booking.status] ?? 'bg-muted'} ${draggable ? 'cursor-grab active:cursor-grabbing hover:brightness-95' : ''} ${isDragging ? 'opacity-40' : ''}`}
      style={{ top: effTop, height: effHeight }}
    >
      {draggable && (
        <div
          className='absolute inset-x-0 top-0 h-2 cursor-ns-resize'
          onPointerDown={makeDown('top')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
        >
          <div className='mx-auto mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-30' />
        </div>
      )}
      <BlockBody booking={booking} height={effHeight} />
      {draggable && (
        <div
          className='absolute inset-x-0 bottom-0 h-2 cursor-ns-resize'
          onPointerDown={makeDown('bottom')}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
        >
          <div className='mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-current opacity-30' />
        </div>
      )}
    </div>
  );
  // don't pop the card while dragging
  if (isDragging) return block;
  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>{block}</HoverCardTrigger>
      <HoverCardContent side='right' align='start' className='w-64 text-sm'>
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2'>
            <span className='font-semibold'>{booking.userName ?? '—'}</span>
            <Badge variant='secondary' className='shrink-0 text-[10px]'>
              {statusLabel}
            </Badge>
          </div>
          {booking.groupName && (
            <div className='text-muted-foreground text-[11px]'>{booking.groupName}</div>
          )}
          <div className='text-muted-foreground text-xs'>
            {booking.equipmentName ?? booking.equipmentId}
          </div>
          <div className='text-xs'>
            {fmtFull(booking.startAt, locale)} → {fmtFull(booking.endAt, locale)}
          </div>
          {booking.purpose && (
            <div className='text-xs'>
              <span className='text-muted-foreground'>· </span>
              {booking.purpose}
            </div>
          )}
          {booking.notes && (
            <div className='text-muted-foreground border-t pt-1.5 text-xs'>{booking.notes}</div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
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
      {Array.from({ length: SLOTS }, (_, i) => {
        const hour = DAY_START_HOUR + (i * SLOT_MIN) / 60;
        const offHours = hour < BIZ_START_HOUR || hour >= BIZ_END_HOUR;
        return (
          <div
            key={i}
            className={`border-b ${i % 2 === 1 ? 'border-border/60' : 'border-border/25'} ${offHours ? 'bg-muted/30' : ''}`}
            style={{ height: ROW_H }}
          />
        );
      })}
    </>
  );
}

/** Floating preview shown in DragOverlay (keeps block shape while dragging). */
function DragPreview({
  booking,
  startAt,
  endAt
}: {
  booking: Booking;
  startAt: number;
  endAt: number;
}) {
  const h = Math.max(((endAt - startAt) / SLOT_MS) * ROW_H - 2, 18);
  return (
    <div
      className={`overflow-hidden rounded-md px-2 py-1 text-[11px] leading-tight shadow-lg ${statusStyle[booking.status] ?? 'bg-muted'}`}
      style={{ height: h, width: 140 }}
    >
      <BlockBody booking={booking} height={h} />
    </div>
  );
}

/** A day column's hour area = droppable target (id = day-start ms as string). */
function DroppableColumn({ dayStart, children }: { dayStart: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: String(dayStart) });
  return (
    <div ref={setNodeRef} className='relative' style={{ height: SLOTS * ROW_H }}>
      {children}
    </div>
  );
}

/** Month overview: 7×6 grid, day cells with booking chips. View-only. */
function MonthGrid({
  monthAnchor,
  bookings,
  equipmentId,
  filterUser,
  filterGroup,
  now,
  locale,
  onPickDay
}: {
  monthAnchor: Date;
  bookings: Booking[];
  equipmentId: string;
  filterUser: string;
  filterGroup: string;
  now: number | undefined;
  locale: string;
  onPickDay: (dayStart: number) => void;
}) {
  const monthStart = startOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart); // Sunday before/at month start
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
  const monthIdx = monthStart.getMonth();
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(gridStart.getTime() + i * DAY_MS).toLocaleDateString(locale, { weekday: 'short' })
  );

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='grid grid-cols-7 border-b'>
        {weekdayNames.map((w) => (
          <div
            key={w}
            className='text-muted-foreground bg-muted/20 px-2 py-1 text-center text-[10px] font-medium uppercase'
          >
            {w}
          </div>
        ))}
      </div>
      <div className='grid grid-cols-7'>
        {days.map((d) => {
          const dayStart = d.getTime();
          const inMonth = d.getMonth() === monthIdx;
          const isToday = now !== undefined && sameDay(dayStart, now);
          const dayEnd = dayStart + DAY_MS;
          const dayBookings = bookings
            .filter(
              (b) =>
                b.equipmentId === equipmentId &&
                b.status !== 'cancelled' &&
                (filterUser === 'all' || b.userId === filterUser) &&
                (filterGroup === 'all' || b.groupId === filterGroup) &&
                b.endAt > dayStart &&
                b.startAt < dayEnd
            )
            .toSorted((a, b) => a.startAt - b.startAt);
          const shown = dayBookings.slice(0, 3);
          const extra = dayBookings.length - shown.length;
          return (
            <button
              key={dayStart}
              type='button'
              onClick={() => onPickDay(dayStart)}
              className={`flex min-h-24 flex-col gap-0.5 border-b border-r p-1 text-left last:border-r-0 hover:bg-muted/40 ${inMonth ? '' : 'bg-muted/20 text-muted-foreground'}`}
            >
              <span
                className={`mb-0.5 inline-flex size-5 items-center justify-center self-start rounded-full text-[11px] tabular-nums ${isToday ? 'bg-primary text-primary-foreground font-semibold' : ''}`}
              >
                {d.getDate()}
              </span>
              {shown.map((b) => (
                <span
                  key={b.id}
                  className={`truncate rounded px-1 text-[10px] leading-tight ${statusStyle[b.status] ?? 'bg-muted'}`}
                >
                  {fmtClock(b.startAt)} {b.userName ?? b.purpose}
                </span>
              ))}
              {extra > 0 && <span className='text-muted-foreground text-[10px]'>+{extra}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BookingTimeline() {
  const t = useTranslations('bookings');
  const tStatus = useTranslations('bookings.status');
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const { bookings, loading: bLoading } = useBookings();
  const { equipment, loading: eLoading } = useEquipmentList();
  const [anchor, setAnchor] = useState<Date | undefined>(undefined);
  const [now, setNow] = useState<number | undefined>(undefined);
  const [weekEquip, setWeekEquip] = useState<string>('');
  const [view, setView] = useState<'week' | 'month'>('week');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [pending, setPending] = useState<Record<string, { startAt: number; endAt: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setAnchor(startOfWeek(new Date()));
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

  // drag: vertical -> change time within the booking's own day
  function handleDragStart(ev: DragStartEvent) {
    setActiveId(String(ev.active.id));
  }

  function handleDragEnd(ev: DragEndEvent) {
    setActiveId(null);
    const b = bookings.find((x) => x.id === ev.active.id);
    if (!b) return;
    if (b.status === 'completed') {
      toast.error(t('lockedCompleted'));
      return;
    }
    const { startAt, endAt } = effTime(b);
    const duration = endAt - startAt;
    const dy = ev.delta.y;
    const slotDelta = Math.round(dy / ROW_H);

    // target day: dropped column (over.id = day-start ms), else same day
    const targetDay = ev.over ? Number(ev.over.id) : startOfDay(new Date(startAt)).getTime();
    const srcDay = startOfDay(new Date(startAt)).getTime();
    if (targetDay === srcDay && slotDelta === 0) return;

    // keep time-of-day, shift by vertical slots, rebase onto target day
    const timeOfDayMs = startAt - srcDay;
    let newStart = targetDay + timeOfDayMs + slotDelta * SLOT_MS;
    const gTop = targetDay + DAY_START_HOUR * 3600000;
    const gBottom = targetDay + DAY_END_HOUR * 3600000;
    newStart = Math.max(gTop, Math.min(newStart, gBottom - duration));
    if (newStart === startAt) return;
    if (newStart < Date.now()) {
      toast.error(t('noPast'));
      return;
    }
    void persist(b, newStart, newStart + duration);
  }

  function handleResize(b: Booking, deltaPx: number) {
    if (b.status === 'completed') {
      toast.error(t('lockedCompleted'));
      return;
    }
    const { startAt, endAt } = effTime(b);
    const dayBase = startOfDay(new Date(startAt)).getTime();
    const gBottom = dayBase + DAY_END_HOUR * 3600000;
    const slotDelta = Math.round(deltaPx / ROW_H);
    if (slotDelta === 0) return;
    let newEnd = endAt + slotDelta * SLOT_MS;
    newEnd = Math.max(startAt + MIN_MS, Math.min(newEnd, gBottom));
    if (newEnd === endAt) return;
    if (newEnd < Date.now()) {
      toast.error(t('noPast'));
      return;
    }
    void persist(b, startAt, newEnd);
  }

  function handleResizeTop(b: Booking, deltaPx: number) {
    if (b.status === 'completed') {
      toast.error(t('lockedCompleted'));
      return;
    }
    const { startAt, endAt } = effTime(b);
    const dayBase = startOfDay(new Date(startAt)).getTime();
    const gTop = dayBase + DAY_START_HOUR * 3600000;
    const slotDelta = Math.round(deltaPx / ROW_H);
    if (slotDelta === 0) return;
    let newStart = startAt + slotDelta * SLOT_MS;
    newStart = Math.min(endAt - MIN_MS, Math.max(newStart, gTop));
    if (newStart === startAt) return;
    if (newStart < Date.now()) {
      toast.error(t('noPast'));
      return;
    }
    void persist(b, newStart, endAt);
  }

  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const activeEquip = weekEquip || equipment[0]?.id || '';
  const activeBooking = activeId ? (bookings.find((x) => x.id === activeId) ?? null) : null;
  const users = Array.from(
    new Map(
      bookings.filter((b) => b.userId).map((b) => [b.userId, b.userName?.trim() || b.userId])
    ).entries()
  ).toSorted((a, b) => a[1].localeCompare(b[1]));
  const groups = Array.from(
    new Map(
      bookings
        .filter((b) => b.groupId && b.groupName)
        .map((b) => [b.groupId as string, b.groupName as string])
    ).entries()
  ).toSorted((a, b) => a[1].localeCompare(b[1]));
  const weekLabel = `${weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
  const monthLabel = startOfMonth(anchor).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric'
  });
  const headerLabel = view === 'month' ? monthLabel : weekLabel;

  const step = (dir: number) =>
    setAnchor((d) => {
      const base = d ?? new Date();
      return view === 'month' ? addMonths(base, dir) : new Date(base.getTime() + dir * 7 * DAY_MS);
    });
  const goToday = () =>
    setAnchor(view === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date()));

  return (
    <div className='space-y-3'>
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
          <Button variant='outline' size='sm' onClick={goToday}>
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
          <span className='ml-2 text-sm font-medium'>{headerLabel}</span>
        </div>

        <div className='flex items-center gap-2'>
          <div className='flex rounded-md border p-0.5'>
            <Button
              variant={view === 'week' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={() => setView('week')}
            >
              {t('viewWeek')}
            </Button>
            <Button
              variant={view === 'month' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-xs'
              onClick={() => setView('month')}
            >
              {t('viewMonth')}
            </Button>
          </div>
          {groups.length > 0 && (
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className='h-8 w-40 text-xs'>
                <SelectValue placeholder={t('filterGroup')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('filterAllGroups')}</SelectItem>
                {groups.map(([gid, name]) => (
                  <SelectItem key={gid} value={gid}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className='h-8 w-40 text-xs'>
              <SelectValue placeholder={t('filterUser')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('filterAllUsers')}</SelectItem>
              {users.map(([uid, name]) => (
                <SelectItem key={uid} value={uid}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {equipment.length > 0 && (
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
        </div>
      </div>

      {equipment.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border py-12 text-center text-sm'>
          {t('empty')}
        </div>
      ) : view === 'month' ? (
        <MonthGrid
          monthAnchor={anchor}
          bookings={bookings}
          equipmentId={activeEquip}
          filterUser={filterUser}
          filterGroup={filterGroup}
          now={now}
          locale={locale}
          onPickDay={(dayStart) => {
            setAnchor(startOfWeek(new Date(dayStart)));
            setView('week');
          }}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className='overflow-hidden rounded-lg border'>
            <div className='flex'>
              <HourGutter />
              <div className='flex flex-1'>
                {weekDays.map((wd) => {
                  const wdStart = wd.getTime();
                  const gTop = wdStart + DAY_START_HOUR * 3600000;
                  const gBottom = wdStart + DAY_END_HOUR * 3600000;
                  const isWtoday = startOfDay(new Date()).getTime() === wdStart;
                  const nowTop =
                    now && isWtoday && now >= gTop && now <= gBottom
                      ? ((now - gTop) / SLOT_MS) * ROW_H
                      : null;
                  const colBookings = bookings.filter((b) => {
                    const { startAt, endAt } = effTime(b);
                    return (
                      b.equipmentId === activeEquip &&
                      (filterUser === 'all' || b.userId === filterUser) &&
                      (filterGroup === 'all' || b.groupId === filterGroup) &&
                      b.status !== 'cancelled' &&
                      endAt > gTop &&
                      startAt < gBottom
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
                      <DroppableColumn dayStart={wdStart}>
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
                          const { top, height } = blockFor(startAt, endAt, gTop, gBottom);
                          return (
                            <DayBlock
                              key={b.id}
                              booking={b}
                              top={top}
                              height={height}
                              draggable={isAdmin}
                              onResize={handleResize}
                              onResizeTop={handleResizeTop}
                              locale={locale}
                              statusLabel={tStatus(b.status)}
                            />
                          );
                        })}
                      </DroppableColumn>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeBooking && (
              <DragPreview
                booking={activeBooking}
                startAt={effTime(activeBooking).startAt}
                endAt={effTime(activeBooking).endAt}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {!isAdmin && <p className='text-muted-foreground text-xs'>{t('timelineReadonly')}</p>}
    </div>
  );
}
