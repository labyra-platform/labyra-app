# ADR-026: Data Integrity Layer 2 (Scheduled Orphan Audit)

<!-- R179-2026-05-18 -->
<!-- @r179-applied -->

**Status**: Accepted
**Date**: 2026-05-18
**Phase**: R179

---

## Context

Labyra writes documents across multiple Firestore subcollections with
parent references. Orphan sources:
- Hard-delete of parent without cascade
- Network drop mid-pipeline
- Bug in Layer 1 write-time guards
- Manual Firestore Console deletes

Layer 1 (write-time guards) catches most cases but cannot be exhaustive.
Need detection mechanism.

## Decision

Add scheduled `auditOrphansWeekly` Firebase Function. Scans per-tenant
collections, writes report to `_integrity_reports/{date}` per-tenant + admin
summary at `_admin/integrity_reports/{date}`. NO auto-delete.

### Detectability limitations (current schema)

Firestore design constraint: subcollections under deleted parent docs are
NOT discoverable via parent-doc listing. Only ways to detect such orphans:
1. Subdocs carry parent ID as field → query via collectionGroup
2. Subdocs carry tenant ID → bound collectionGroup by tenant
3. Iterate every possible parent ID (impossible without external list)

Current Labyra schema:
- `messages` docs: no `tenantId`, no `conversationId` (parent is path itself)
- `citations` docs: parent paperId in path only
- `_audit_classify` docs: doc IDs are `{paperId}_{ts}` (detectable!)

### What we CAN detect (R179)

| Collection | Detectable | Why |
|---|---|---|
| `_audit_classify` | ✅ YES | Doc IDs encode parent paperId |
| `messages` | ❌ NO | No field links to parent; subcoll under deleted conv invisible |
| `citations` | ❌ NO | Same as messages |

### What we'll add later (R180+)

To make messages/citations detectable, write `parentId` field on every child
doc going forward. Then collectionGroup query can find orphans. This is a
schema change requiring back-compat scan logic.

For now, R179 ships with `_audit_classify` detection + structure for the
other 2 checks (NO-OP placeholders) so the report shape is stable.

### Why weekly

Orphan accumulation rate slow. Weekly balances detection latency vs
Firestore read cost. Bumping to daily is cheap ($0.001/run × 7) if needed.

### Report shape

Per-tenant `tenants/{tid}/_integrity_reports/{date}`:
```
{
  date: "2026-05-25",
  tenantId: "tenant-dev-001",
  startedAt: ISO,
  finishedAt: ISO,
  results: [{ collection, scanned, orphans: [{docPath, reason}] }],
  totalOrphans: number
}
```

Admin summary `_admin/integrity_reports/{date}`:
```
{
  date, tenantsScanned, tenantsWithOrphans: [], grandTotalOrphans, finishedAt
}
```

## Consequences

### Positive
- Visibility into Layer 1 escape rate for `_audit_classify`
- Quantitative trigger for Layer 3 build decision
- Low cost (~$0.001/run)
- Report structure stable for future detection additions

### Negative
- Messages/citations NOT detected (schema limitation)
- +1 cron to maintain
- `_integrity_reports` accumulates per-tenant (TTL future round)

### Operational triggers
- Run finds orphans → logger.warn → Cloud Logging alert → ops email
- Manual: query `_admin/integrity_reports/` ordered by date desc
- Same orphan IDs in 2+ runs → consider Layer 3 cleanup

## Future revisit triggers
- Add `parentId` field to messages/citations → re-enable those 2 checks
- 3+ consecutive clean runs → consider monthly cadence
- >10 orphans/run → build Layer 3 admin cleanup UI
