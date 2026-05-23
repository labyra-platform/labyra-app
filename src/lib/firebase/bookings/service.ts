/**
 * Booking service — overlap-safe reservations.
 *
 * Path: tenants/{tenantId}/bookings/{bookingId}
 *
 * Correctness notes:
 *  - Overlap check runs inside runTransaction so two concurrent creates
 *    cannot both pass the "is it free?" check (race-safe).
 *  - Intervals are half-open [startAt, endAt): touching edges DON'T overlap
 *    (a booking ending at 14:00 and one starting at 14:00 are fine).
 *  - Cancelled bookings are ignored when checking conflicts.
 *  - Times are epoch ms (UTC). Display-side handles local rendering.
 *
 * @phase BOOK-1
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { Booking, BookingStatus } from '@/types/bookings';

function bookingsCol(tenantId: string) {
  return getAdminFirestoreService().collection(`tenants/${tenantId}/bookings`);
}

const BLOCKING_STATUSES: BookingStatus[] = ['pending', 'approved', 'in_progress'];

export interface CreateBookingInput {
  equipmentId: string;
  equipmentName?: string;
  startAt: number;
  endAt: number;
  purpose: string;
  notes?: string;
}

export class BookingConflictError extends Error {
  conflicts: Array<{ id: string; startAt: number; endAt: number; userName?: string }>;
  constructor(conflicts: BookingConflictError['conflicts']) {
    super('booking_conflict');
    this.name = 'BookingConflictError';
    this.conflicts = conflicts;
  }
}

/** Half-open interval overlap test. */
function overlaps(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

export async function createBooking(
  tenantId: string,
  input: CreateBookingInput,
  userId: string
): Promise<Booking> {
  if (input.endAt <= input.startAt) throw new Error('invalid_interval');

  const db = getAdminFirestoreService();
  const col = bookingsCol(tenantId);
  const ref = col.doc();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    // Candidate conflicts: same equipment, starting before our end.
    // (We can't add a second range filter on endAt, so filter that in memory.)
    const q = col.where('equipmentId', '==', input.equipmentId).where('startAt', '<', input.endAt);
    const snap = await tx.get(q);

    const conflicts = snap.docs
      .map((d) => d.data() as Booking)
      .filter(
        (b) =>
          BLOCKING_STATUSES.includes(b.status) &&
          overlaps(input.startAt, input.endAt, b.startAt, b.endAt)
      )
      .map((b) => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, userName: b.userName }));

    if (conflicts.length > 0) throw new BookingConflictError(conflicts);

    const booking: Booking = {
      schemaVersion: 1,
      id: ref.id,
      tenantId,
      equipmentId: input.equipmentId,
      equipmentName: input.equipmentName,
      userId,
      startAt: input.startAt,
      endAt: input.endAt,
      purpose: input.purpose,
      status: 'approved', // member auto-approve (admin can cancel later)
      notes: input.notes,
      createdAt: now,
      updatedAt: now
    };
    tx.set(ref, JSON.parse(JSON.stringify(booking)));
    return booking;
  });
}

export async function listBookings(
  tenantId: string,
  opts?: { equipmentId?: string; from?: number; to?: number }
): Promise<Booking[]> {
  let q: FirebaseFirestore.Query = bookingsCol(tenantId);
  if (opts?.equipmentId) q = q.where('equipmentId', '==', opts.equipmentId);
  const snap = await q.orderBy('startAt', 'desc').limit(500).get();
  let items = snap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id }));
  if (opts?.from !== undefined) items = items.filter((b) => b.endAt >= opts.from!);
  if (opts?.to !== undefined) items = items.filter((b) => b.startAt <= opts.to!);
  return items;
}

export async function getBooking(tenantId: string, id: string): Promise<Booking | null> {
  const snap = await bookingsCol(tenantId).doc(id).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as Booking), id: snap.id };
}

export async function cancelBooking(
  tenantId: string,
  id: string,
  requesterId: string,
  isAdmin: boolean
): Promise<void> {
  const ref = bookingsCol(tenantId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('booking_not_found');
  const b = snap.data() as Booking;
  if (!isAdmin && b.userId !== requesterId) throw new Error('forbidden');
  await ref.update({ status: 'cancelled', updatedAt: Date.now() });
}

/**
 * Update a booking's time/purpose. Re-checks overlap (transaction).
 * Owner or admin only.
 */
export async function updateBooking(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Booking, 'startAt' | 'endAt' | 'purpose' | 'notes' | 'status'>>,
  requesterId: string,
  isAdmin: boolean
): Promise<void> {
  const db = getAdminFirestoreService();
  const col = bookingsCol(tenantId);
  const ref = col.doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('booking_not_found');
    const b = snap.data() as Booking;
    if (!isAdmin && b.userId !== requesterId) throw new Error('forbidden');

    const newStart = patch.startAt ?? b.startAt;
    const newEnd = patch.endAt ?? b.endAt;
    if (newEnd <= newStart) throw new Error('invalid_interval');

    // Re-check overlap if time changed.
    if (patch.startAt !== undefined || patch.endAt !== undefined) {
      const q = col.where('equipmentId', '==', b.equipmentId).where('startAt', '<', newEnd);
      const cand = await tx.get(q);
      const conflicts = cand.docs
        .map((d) => d.data() as Booking)
        .filter(
          (other) =>
            other.id !== id &&
            BLOCKING_STATUSES.includes(other.status) &&
            overlaps(newStart, newEnd, other.startAt, other.endAt)
        );
      if (conflicts.length > 0)
        throw new BookingConflictError(
          conflicts.map((c) => ({
            id: c.id,
            startAt: c.startAt,
            endAt: c.endAt,
            userName: c.userName
          }))
        );
    }

    tx.update(ref, { ...patch, updatedAt: Date.now() });
  });
}

/**
 * Find free slots for an equipment within a day window.
 * Returns gaps of at least `minDurationMs` between existing bookings,
 * within [dayStart, dayEnd]. Times are epoch ms.
 */
export async function findAvailableSlots(
  tenantId: string,
  equipmentId: string,
  dayStart: number,
  dayEnd: number,
  minDurationMs: number
): Promise<Array<{ startAt: number; endAt: number }>> {
  const snap = await bookingsCol(tenantId)
    .where('equipmentId', '==', equipmentId)
    .where('startAt', '<', dayEnd)
    .get();

  const busy = snap.docs
    .map((d) => d.data() as Booking)
    .filter((b) => BLOCKING_STATUSES.includes(b.status) && b.endAt > dayStart)
    .map((b) => ({ start: Math.max(b.startAt, dayStart), end: Math.min(b.endAt, dayEnd) }))
    .toSorted((a, b) => a.start - b.start);

  // Merge overlapping busy intervals.
  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of busy) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  // Gaps between merged busy intervals = free slots.
  const free: Array<{ startAt: number; endAt: number }> = [];
  let cursor = dayStart;
  for (const iv of merged) {
    if (iv.start - cursor >= minDurationMs) {
      free.push({ startAt: cursor, endAt: iv.start });
    }
    cursor = Math.max(cursor, iv.end);
  }
  if (dayEnd - cursor >= minDurationMs) {
    free.push({ startAt: cursor, endAt: dayEnd });
  }
  return free;
}
