#!/usr/bin/env node
/**
 * Migrate Sample.status → Sample.workflowStatus (R164 field rename).
 *
 * Reads tenants/{tid}/samples/* and renames `status` → `workflowStatus`.
 * Preserves all other fields. Skip if `workflowStatus` already set.
 *
 * Usage:
 *   FIRESTORE_DATABASE_ID="(default)" node --env-file=.env.local scripts/migrate-sample-status-to-workflow.mjs [--dry-run] [--tenant=<id>]
 *
 * @phase R165-phase-6-samples-status
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const onlyTenant = tenantArg ? tenantArg.slice('--tenant='.length) : null;

function loadCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64)
    return JSON.parse(Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString());
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    return {
      type: 'service_account',
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY
    };
  }
  return null;
}

const creds = loadCredentials();
if (!creds) {
  console.error('No Firebase credentials');
  process.exit(1);
}
if (typeof creds.private_key === 'string') {
  creds.private_key = creds.private_key.replace(/\\n/g, '\n');
}

initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true, databaseId: process.env.FIRESTORE_DATABASE_ID || 'labbook' });

console.log(`[migrate] mode=${dryRun ? 'DRY-RUN' : 'WRITE'} tenant=${onlyTenant ?? 'ALL'}`);

async function main() {
  const tenantsSnap = await db.collection('tenants').get();
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    if (onlyTenant && tenantId !== onlyTenant) continue;

    const samplesSnap = await db.collection('tenants').doc(tenantId).collection('samples').get();
    let updated = 0;
    let skipped = 0;

    for (const doc of samplesSnap.docs) {
      const data = doc.data();
      // Skip if already migrated
      if (data.workflowStatus) {
        skipped++;
        totalSkipped++;
        continue;
      }
      const oldStatus = data.status;
      if (!oldStatus) {
        // No status field at all → default 'prepared'
        if (!dryRun) {
          await doc.ref.update({ workflowStatus: 'prepared' });
        }
        updated++;
        totalUpdated++;
        console.log(`[${tenantId}/${doc.id}] no status → defaulted workflowStatus=prepared`);
        continue;
      }
      if (!dryRun) {
        await doc.ref.update({
          workflowStatus: oldStatus
          // Keep old `status` field for backward compat with any unmigrated code paths.
          // Cleanup: separate script after R166.
        });
      }
      updated++;
      totalUpdated++;
      console.log(`[${tenantId}/${doc.id}] status='${oldStatus}' → workflowStatus='${oldStatus}'`);
    }

    console.log(`[${tenantId}] updated=${updated} skipped=${skipped} (total=${samplesSnap.size})`);
  }

  console.log('');
  console.log(`Summary: updated=${totalUpdated} skipped=${totalSkipped}`);
  if (dryRun) console.log('DRY-RUN — no writes');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
