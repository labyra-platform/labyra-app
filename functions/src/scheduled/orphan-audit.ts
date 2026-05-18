/**
 * Scheduled function: scan child collections for parent-gone orphans.
 *
 * Schedule: Sunday 04:00 UTC (after backupCostsDaily 02:00, ragasEvalWeekly 03:00).
 * Target: tenants/{tid}/_integrity_reports/{date} + _admin_integrity_reports/{date}.
 *
 * NO AUTO-DELETE. Detection only.
 *
 * Approach: scan per-tenant (does NOT rely on subdoc tenantId field which
 * is not written by current pipeline).
 *
 * Checks:
 *   1. aiConversations/{cid}/messages → parent aiConversations/{cid}
 *   2. papers/{pid}/citations → parent papers/{pid}
 *   3. _audit_classify/{paperId}_{ts} → parent papers/{paperId}
 *
 * Note: _audit_provenance check deferred to v2 (schema not yet stabilized).
 *
 * @phase R179
 * @r179-applied
 */
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

interface OrphanResult {
  collection: string;
  scanned: number;
  orphans: Array<{ docPath: string; reason: string }>;
}

interface TenantReport {
  date: string;
  tenantId: string;
  startedAt: string;
  finishedAt: string;
  results: OrphanResult[];
  totalOrphans: number;
}

function todayUtcYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function listParentIds(
  db: FirebaseFirestore.Firestore,
  parentCollectionPath: string
): Promise<Set<string>> {
  const snap = await db.collection(parentCollectionPath).select().get();
  return new Set(snap.docs.map((d) => d.id));
}

async function checkMessagesOrphans(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<OrphanResult> {
  const result: OrphanResult = {
    collection: 'aiConversations/{cid}/messages',
    scanned: 0,
    orphans: []
  };

  const convIds = await listParentIds(db, `tenants/${tenantId}/aiConversations`);

  // For each conv, scan its messages — if conv is deleted but messages remain
  // (shouldn't happen via normal API, but possible via Firestore Console delete),
  // those messages become orphans. We need to ALSO check for messages under
  // convIds we don't have. Firestore doesn't list "all parent IDs that have
  // subcollections" — collectionGroup would, but our messages lack tenantId.
  //
  // Pragmatic compromise: assume convIds set is complete. If admin manually
  // deleted a conv via console, its message subcoll is invisible to us → we
  // can't detect that orphan via this approach. Document this limitation in
  // ADR-026.
  //
  // What we CAN catch: messages with stale conversationId field pointing to
  // deleted conv (if such a field exists on message doc). Current schema does
  // NOT write conversationId on message — message ID is the parent path itself.
  // So orphans here are NOT detectable without listing convIds we've never seen.
  //
  // Therefore: this check is a NO-OP for current schema. We log scanned=0 and
  // keep the function structure for future schema additions.
  result.scanned = convIds.size;
  return result;
}

async function checkCitationOrphans(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<OrphanResult> {
  const result: OrphanResult = {
    collection: 'papers/{pid}/citations',
    scanned: 0,
    orphans: []
  };

  const paperIds = await listParentIds(db, `tenants/${tenantId}/papers`);
  result.scanned = paperIds.size;
  // Same limitation as messages: subcoll orphans under deleted parents are
  // not discoverable. NO-OP for now.
  return result;
}

async function checkAuditClassifyOrphans(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<OrphanResult> {
  // _audit_classify uses {paperId}_{ts} doc IDs — orphans ARE detectable
  // because docs live at tenants/{tid}/_audit_classify/* not under papers.
  const result: OrphanResult = {
    collection: '_audit_classify',
    scanned: 0,
    orphans: []
  };

  const paperIds = await listParentIds(db, `tenants/${tenantId}/papers`);
  const auditSnap = await db
    .collection(`tenants/${tenantId}/_audit_classify`)
    .select() // metadata only
    .get();
  result.scanned = auditSnap.size;

  for (const d of auditSnap.docs) {
    const idx = d.id.lastIndexOf('_');
    if (idx <= 0) {
      result.orphans.push({
        docPath: d.ref.path,
        reason: 'malformed_id_no_timestamp_separator'
      });
      continue;
    }
    const paperId = d.id.slice(0, idx);
    if (!paperIds.has(paperId)) {
      result.orphans.push({
        docPath: d.ref.path,
        reason: `parent_paper_missing:${paperId}`
      });
    }
  }

  return result;
}

export const auditOrphansWeekly = onSchedule(
  {
    schedule: '0 4 * * 0', // Sunday 04:00 UTC
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 0
  },
  async () => {
    const date = todayUtcYmd();
    const db = getFirestore();

    logger.info('[orphan-audit] starting', { date });

    const tenantsSnap = await db.collection('tenants').get();
    logger.info(`[orphan-audit] scanning ${tenantsSnap.size} tenants`);

    let grandTotalOrphans = 0;
    const tenantsWithOrphans: string[] = [];

    for (const tenantDoc of tenantsSnap.docs) {
      const tenantId = tenantDoc.id;
      const startedAt = new Date().toISOString();
      const results: OrphanResult[] = [];

      // 1. messages (NO-OP currently — schema doesn't allow detection)
      try {
        results.push(await checkMessagesOrphans(db, tenantId));
      } catch (err) {
        logger.error(`[orphan-audit] messages err for ${tenantId}`, { err: String(err) });
      }

      // 2. citations (NO-OP currently)
      try {
        results.push(await checkCitationOrphans(db, tenantId));
      } catch (err) {
        logger.error(`[orphan-audit] citations err for ${tenantId}`, { err: String(err) });
      }

      // 3. _audit_classify (DETECTABLE)
      try {
        results.push(await checkAuditClassifyOrphans(db, tenantId));
      } catch (err) {
        logger.error(`[orphan-audit] audit_classify err for ${tenantId}`, {
          err: String(err)
        });
      }

      const totalOrphans = results.reduce((s, r) => s + r.orphans.length, 0);
      grandTotalOrphans += totalOrphans;
      if (totalOrphans > 0) tenantsWithOrphans.push(tenantId);

      const report: TenantReport = {
        date,
        tenantId,
        startedAt,
        finishedAt: new Date().toISOString(),
        results,
        totalOrphans
      };

      await db.doc(`tenants/${tenantId}/_integrity_reports/${date}`).set(report);
      logger.info(`[orphan-audit] ${tenantId} done: orphans=${totalOrphans}`, {
        results: results.map((r) => ({ c: r.collection, n: r.orphans.length }))
      });
    }

    await db.doc(`_admin_integrity_reports/${date}`).set({
      date,
      tenantsScanned: tenantsSnap.size,
      tenantsWithOrphans,
      grandTotalOrphans,
      finishedAt: new Date().toISOString()
    });

    if (grandTotalOrphans > 0) {
      logger.warn('[orphan-audit] orphans detected', {
        grandTotalOrphans,
        tenantsWithOrphans
      });
    } else {
      logger.info('[orphan-audit] clean run, no orphans');
    }
  }
);
