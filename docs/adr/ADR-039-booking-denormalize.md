# ADR-039 — Denormalize user & group onto Booking

**Status:** Accepted · **Date:** 2026-05-25 · **Round:** R215

## Context

`Booking` has `userName?` and (new) `groupId?`/`groupName?` fields for display
and filtering on the timeline. But `createBooking` never populated `userName`
(only `userId`), so timeline blocks showed "—". And there was no group info at
all, blocking group-based filtering.

Group membership is expressed via **custom claims** (`groupId` per user, ADR-034),
not a member list on the group doc. So a user's group is known only from their
own token — we can capture it at booking-creation time from `auth.groupId`
(already surfaced by `authenticateWriter`).

Per ADR-034, bookings are **tenant-shared** physical resources (not group-isolated
IP). Group on a booking is therefore **display/filter metadata only** — it does
not change access control. Any tenant member can still see all bookings.

## Decision

At `createBooking`, denormalize:
- `userName` ← `getUserById(userId).displayName || email` (admin SDK lookup).
- `groupId` ← caller's `auth.groupId` (from claim; not client-supplied — trust).
- `groupName` ← `getGroup(tenantId, groupId).name` (if groupId present).

Lookups run **before** the overlap transaction (they don't need to be atomic).
Stored on the booking doc so the timeline reads them directly (no client joins).

Old bookings keep missing fields (acceptable; backfill out of scope).

## Implementation
- `types/bookings.ts`: `Booking` += `groupId?: string`, `groupName?: string`.
- `service.ts`: `createBooking(tenantId, input, userId, groupId?)`; pre-tx lookups
  for userName + groupName; set on booking object.
- `route.ts` POST: pass `auth.groupId` as 4th arg.

## Consequences
- Timeline blocks show real user names (fixes "—") + group, enable group filter.
- groupId is trusted from claims, not spoofable by client.
- Two extra reads per create (getUser + getGroup) — outside the transaction,
  negligible.
- updateBooking unchanged (time/purpose edits don't touch user/group).
- Backlog: backfill userName/group on legacy bookings if needed; pending→approve
  flow + auto-cancel are separate (current flow auto-approves).
