/**
 * Force-requeue a paper for reprocessing.
 *
 * Resets a paper document to queued state and clears all processing
 * metadata. Use when:
 *   - Paper stuck in 'extracting_*' state after worker crash
 *   - Need to re-run pipeline after fixing a bug (without re-uploading PDF)
 *   - Cancelled paper should be retried
 *
 * Does NOT republish Pub/Sub message — use /api/papers/[id]/reprocess
 * REST endpoint instead if you need full requeue including Pub/Sub.
 * This script only resets Firestore state for manual republish flows.
 *
 * Usage:
 *   FIRESTORE_DATABASE_ID='(default)' node --env-file=.env.local \
 *     scripts/_force-requeue-paper.mjs <paperId> [--tenant <tenantId>]
 *
 * @phase R168-3.7b
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ databaseId: '(default)' });

// Parse args: <paperId> [--tenant <tenantId>]
const args = process.argv.slice(2);
const PAPER_ID = args[0];
let TENANT_ID = 'tenant-dev-001';
const tenantFlagIdx = args.indexOf('--tenant');
if (tenantFlagIdx >= 0 && args[tenantFlagIdx + 1]) {
  TENANT_ID = args[tenantFlagIdx + 1];
}

if (!PAPER_ID || PAPER_ID.startsWith('--')) {
  console.error('Usage: node _force-requeue-paper.mjs <paperId> [--tenant <tenantId>]');
  console.error('Default tenant: tenant-dev-001');
  process.exit(1);
}

const ref = db.doc(`tenants/${TENANT_ID}/papers/${PAPER_ID}`);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`✗ Paper not found: tenants/${TENANT_ID}/papers/${PAPER_ID}`);
  process.exit(2);
}

const before = snap.data();
console.log(`Before: status=${before?.status}, version=${before?.version}`);

// Reset to queued + clear all processing fields
await ref.update({
  status: 'queued',
  statusUpdatedAt: Timestamp.now(),
  cancelRequestedAt: FieldValue.delete(),
  cancelledAt: FieldValue.delete(),
  cancelReason: FieldValue.delete(),
  processingStartedAt: FieldValue.delete(),
  processingFinishedAt: FieldValue.delete(),
  errorMessage: FieldValue.delete(),
  errorStack: FieldValue.delete(),
  // Bump version to invalidate stale worker pickups
  version: FieldValue.increment(1)
});

console.log(`✓ Requeued ${PAPER_ID} (tenant=${TENANT_ID})`);
console.log(`  Next: trigger reprocess via /api/papers/${PAPER_ID}/reprocess to republish Pub/Sub message`);
