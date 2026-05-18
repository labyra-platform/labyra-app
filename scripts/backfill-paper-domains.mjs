#!/usr/bin/env node
/**
 * Backfill paper domain classification (R178-3).
 *
 * Lists papers needing classification across tenants. Optionally triggers
 * Pub/Sub republish jobs to make worker re-run pipeline (includes Step 1d).
 *
 * Usage:
 *   node scripts/backfill-paper-domains.mjs --tenant tenant-dev-001 --print-ids
 *   node scripts/backfill-paper-domains.mjs --tenant tenant-dev-001 --dry-run
 *   node scripts/backfill-paper-domains.mjs --all-tenants
 *
 * Env required:
 *   GOOGLE_APPLICATION_CREDENTIALS pointing to service account JSON
 *   FIRESTORE_DATABASE_ID="(default)"
 *
 * @phase R178-3
 * @r178-3-applied
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const printIds = args.includes('--print-ids');
const allTenants = args.includes('--all-tenants');
const tenantArg = args.indexOf('--tenant');
const tenantId = tenantArg >= 0 ? args[tenantArg + 1] : null;

if (!allTenants && !tenantId) {
  console.error('Usage: --tenant <id> OR --all-tenants  [--dry-run] [--print-ids]');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();
db.settings({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });

async function getTenants() {
  if (tenantId) return [tenantId];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

async function backfillTenant(tid) {
  const papersSnap = await db.collection(`tenants/${tid}/papers`).get();
  const candidates = papersSnap.docs.filter((d) => {
    const data = d.data();
    return (
      !data.domain ||
      data.domain === 'unknown' ||
      data.domainTaxonomyVersion !== 'v1'
    );
  });

  console.log(
    `tenant=${tid} total=${papersSnap.size} needsClassify=${candidates.length}`
  );

  if (printIds) {
    for (const d of candidates) {
      const data = d.data();
      console.log(
        `  paper=${d.id} title="${(data.title || '').slice(0, 60)}" current_domain=${data.domain || '(none)'}`
      );
    }
    return;
  }

  if (dryRun) {
    console.log(`  [dry-run] would enqueue ${candidates.length} reclassify jobs`);
    return;
  }

  // R178-3b-followup: implement Pub/Sub publish to 'paper-processing' topic
  // For now, log manual reprocess instructions.
  console.log(
    `  TODO: enqueue Pub/Sub jobs (${candidates.length} papers). ` +
      `Workaround: trigger via /api/papers/{id}/reprocess per paper.`
  );
}

(async () => {
  const tenants = await getTenants();
  for (const t of tenants) await backfillTenant(t);
  console.log('done.');
})().catch((err) => {
  console.error('backfill failed:', err);
  process.exit(1);
});
