# ADR-040: Booking limits — single source of truth

**Status**: Accepted
**Date**: 2026-05-24
**Phase**: R225 (refined R228, R238)

## Context

Booking constraints (minimum/maximum duration, how far ahead a booking may start,
which equipment statuses block booking, which booking statuses occupy a slot) were
originally hard-coded in the server service (`src/lib/firebase/bookings/service.ts`,
R220/R221). The client form had no knowledge of them, so a user only discovered a
violation after submitting and receiving a 422/409 from the server. The numbers also
risked drifting if duplicated into client validation.

## Decision

Introduce a single pure module **`src/features/bookings/constants.ts`** as the one
source of truth for all booking limits. It contains no server-only imports, so both
the client (Zod schema, form) and the server (service) import the same values —
defense in depth: the client validates for UX, the server re-validates for safety,
both from identical constants.

Contents:
- `MIN_DURATION_MS = 30 * 60_000` (30 min)
- `MAX_DURATION_MS = 8 * 3_600_000` (8 h)
- `MAX_ADVANCE_MS = 14 * 86_400_000` (14 days ahead)
- `UNAVAILABLE_EQUIPMENT_STATUSES = ['maintenance', 'broken', 'retired']`
- `BLOCKING_STATUSES = ['pending', 'approved', 'in_progress']`
- `isEquipmentBookable(status)` — equipment status gate
- `intervalsOverlap(s1, e1, s2, e2)` — half-open interval overlap test

Consumers:
- `schema.ts` — `.refine()` for duration + advance (messages `too_short` /
  `too_long` / `too_far_ahead`, mapped to i18n in the form).
- `service.ts` — server create/update guards; equipment gate via
  `isEquipmentBookable`; conflict detection via `intervalsOverlap` +
  `BLOCKING_STATUSES` (R238 removed the service's private duplicates).
- `booking-form.tsx` — realtime conflict warning (R228) reusing
  `intervalsOverlap` + `BLOCKING_STATUSES`; live-status equipment dropdown via
  `isEquipmentBookable`; duration-tag clamping via `MAX_DURATION_MS`.

## Consequences

- Changing any limit in one place propagates to schema, service, and form.
- The client warns before submit; the server remains the final authority (409/422).
- Limits apply to everyone, including admins (deliberate — fairness of shared
  equipment; see R218/R221).
- The module must stay pure (no `server-only`, no firebase-admin) so the edge/client
  bundle can import it.

## Notes

- R238 finished the consolidation: `service.ts` previously kept its own
  `BLOCKING_STATUSES` and `overlaps()`; these were removed in favour of the shared
  constants.
- Purpose is free text (not an enum); `BOOKING_PURPOSE_PRESETS` here are click-to-fill
  suggestions only (R230).
