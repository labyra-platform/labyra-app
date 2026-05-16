#!/usr/bin/env node
/**
 * Force requeue stuck papers (R168 §3.7 utility)
 * @phase R176-1c-utility
 *
 * Use case: paper stuck in non-terminal status (cancelling, processing,
 * indexing, ...) → state machine refuse reprocess. Force reset to 'queued'
 * + clear cancel/processing fields → next reprocess accepts.
 *
 * KHÁC với _force-reset-paper.mjs (sets cancelled — misleading name).
 *
 * Idempotent. Dry-run mode mặc định khuyến khích.
 *
 * Run:
 *   FIRESTORE_DATABASE_ID="(default)" \
 *   GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/application_default_credentials.json \
 *   GCP_PROJECT_ID=labyra-app-dev \
 *   node scripts/_force-requeue-paper.mjs --tenant tenant-dev-001 --id <paperId> [--dry]
 *
 * Multi-ID:
 *   --ids id1,id2,id3
 */

import admin from 'firebase-admin';
import process from 'node:process';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const tenant = arg('tenant');
const id = arg('id');
const ids = arg('ids');
const dry = arg('dry', false) === true;

if (!tenant) {
  console.error('ERROR: --tenant required');
  process.exit(1);
}
if (!id && !ids) {
  console.error('ERROR: --id or --ids required');
  process.exit(1);
}

const idList = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : [id];

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'labyra-app-dev' });
}
const db = admin.firestore();

console.log(`\n=== Force Requeue (R176-1c) ===`);
console.log(`Tenant: ${tenant}`);
console.log(`Papers: ${idList.length}`);
console.log(`Dry:    ${dry}\n`);

// Fields to clear from previous run/cancel state.
// Worker reprocess endpoint guard: only acts when status terminal
// (failed | cancelled | indexed). Setting to 'queued' bypasses guard
// — caller bears responsibility for state correctness.
// // R176-1c-1b-terminal-status
// Set status='cancelled' (terminal) so reprocess endpoint accepts.
// Endpoint guard: only TERMINAL_STATUSES (indexed|failed|cancelled).
// 'cancelled' is the cleanest terminal — semantically "previous run aborted".
// Clear processing/cancel artifacts to give worker a fresh slate.
const RESET_FIELDS = {
  status: 'cancelled',
  cancelRequestedAt: admin.firestore.FieldValue.delete(),
  cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
  failedAt: admin.firestore.FieldValue.delete(),
  error: admin.firestore.FieldValue.delete(),
  processingStartedAt: admin.firestore.FieldValue.delete(),
  // version NOT bumped here — reprocess endpoint bumps it on accept.
  requeuedAt: admin.firestore.FieldValue.serverTimestamp(),
  requeuedBy: 'admin-script-R176-1c',
};

let success = 0;
let fail = 0;

for (const pid of idList) {
  const ref = db.doc(`tenants/${tenant}/papers/${pid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`✗ ${pid.slice(0, 16)}: not found`);
    fail++;
    continue;
  }
  const data = snap.data();
  const before = {
    status: data.status,
    cancelRequestedAt: data.cancelRequestedAt ? 'set' : null,
    cancelledAt: data.cancelledAt ? 'set' : null,
    version: data.version,
  };

  if (dry) {
    console.log(`DRY ${pid.slice(0, 16)}: ${JSON.stringify(before)} → status=cancelled (terminal)`);
    success++;
    continue;
  }

  try {
    await ref.update(RESET_FIELDS);
    console.log(`✓ ${pid.slice(0, 16)}: ${before.status} → cancelled (terminal, ready for reprocess)`);
    success++;
  } catch (e) {
    console.log(`✗ ${pid.slice(0, 16)}: ${e.message}`);
    fail++;
  }
}

console.log(`\n=== Result ===`);
console.log(`Success: ${success}`);
console.log(`Failed:  ${fail}`);

if (success > 0 && !dry) {
  console.log(`\nNext: re-run batch reprocess to trigger pipeline:`);
  console.log(`  node scripts/_batch-reprocess-papers.mjs --ids ${idList.join(',')}`);
}

process.exit(fail > 0 ? 1 : 0);
