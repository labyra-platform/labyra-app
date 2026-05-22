/**
 * round-192-8-migrate-papers-groupid.mjs — ADR-034 TEAM-3a migration.
 *
 * Backfills `groupId = 'lab-shared'` on every paper doc that lacks it.
 * Firestore field only (Pinecone untouched — that is TEAM-5).
 *
 * Usage (from repo root, FIRESTORE creds in env / ADC):
 *   node round-192-8-migrate-papers-groupid.mjs            # DRY RUN (counts only)
 *   node round-192-8-migrate-papers-groupid.mjs --apply    # writes
 *
 * Scoped to a single tenant by default (edit TENANT_ID) to stay safe; pass
 * --all-tenants to sweep every tenant.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const ALL_TENANTS = process.argv.includes('--all-tenants');
const TENANT_ID = process.env.MIGRATE_TENANT_ID ?? 'tenant-dev-001';
const LAB_SHARED = 'lab-shared';

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function tenantIds() {
  if (!ALL_TENANTS) return [TENANT_ID];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

async function run() {
  console.log(`[migrate] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenants=${ALL_TENANTS ? 'ALL' : TENANT_ID}`);
  let scanned = 0;
  let needFix = 0;
  let fixed = 0;

  for (const tid of await tenantIds()) {
    const papersRef = db.collection(`tenants/${tid}/papers`);
    const snap = await papersRef.get();
    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data();
      if (typeof data.groupId === 'string' && data.groupId.length > 0) continue;
      needFix++;
      console.log(`  [${tid}] ${doc.id} : "${data.title ?? '(no title)'}" → ${LAB_SHARED}`);
      if (APPLY) {
        await doc.ref.update({ groupId: LAB_SHARED });
        fixed++;
      }
    }
  }

  console.log(`\n[migrate] scanned=${scanned} need_fix=${needFix} fixed=${fixed}`);
  if (!APPLY && needFix > 0) {
    console.log('[migrate] DRY-RUN only. Re-run with --apply to write.');
  }
  if (APPLY) {
    console.log('[migrate] done. Verify a few docs in console, then proceed to TEAM-4 read-filter.');
  }
}

run().catch((e) => {
  console.error('[migrate] FAILED:', e);
  process.exit(1);
});
