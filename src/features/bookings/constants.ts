/**
 * Booking limits — single source of truth (R225 / ADR-040).
 *
 * Pure module (no server-only imports) so BOTH the client Zod schema and the
 * server-side service can import the same constants. Defense in depth: client
 * validates for UX, server re-validates for safety, both from these values.
 *
 * Change a limit here -> schema + service + form all stay in sync.
 */

/** Minimum booking length (30 minutes). */
export const MIN_DURATION_MS = 30 * 60_000;

/** Maximum booking length (8 hours). */
export const MAX_DURATION_MS = 8 * 3_600_000;

/** How far ahead a booking may start (14 days). Applies to everyone, incl admin. */
export const MAX_ADVANCE_MS = 14 * 86_400_000;

/** Equipment statuses that block new bookings. */
export const UNAVAILABLE_EQUIPMENT_STATUSES = ['maintenance', 'broken', 'retired'] as const;

export type UnavailableEquipmentStatus = (typeof UNAVAILABLE_EQUIPMENT_STATUSES)[number];

/** True if an equipment status forbids new bookings. */
export function isEquipmentBookable(status: string | undefined): boolean {
  if (!status) return true; // unknown status -> don't block (avoid false negatives)
  return !UNAVAILABLE_EQUIPMENT_STATUSES.includes(status as UnavailableEquipmentStatus);
}

/** Booking statuses that occupy a time slot (block overlap). */
export const BLOCKING_STATUSES = ['pending', 'approved', 'in_progress'] as const;

/** Half-open interval overlap test [s,e): touching edges don't overlap. */
export function intervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}
