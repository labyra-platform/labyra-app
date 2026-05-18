#!/usr/bin/env node
/**
 * Backfill domain classification for papers missing `domain` field.
 *
 * Calls POST /api/papers/{id}/reprocess for each candidate. Worker pipeline
 * Step 1d (R178-3) will classify on reprocess.
 *
 * Usage:
 *   cd ~/LAB-MANAGER/labyra-app
 *   FIREBASE_ID_TOKEN=<token> node backfill-paper-domains.mjs --tenant tenant-dev-001
 *   FIREBASE_ID_TOKEN=<token> node backfill-paper-domains.mjs --tenant tenant-dev-001 --dry-run
 *
 * Get FIREBASE_ID_TOKEN via browser console:
 *   (await (await import('firebase/auth')).getAuth().currentUser.getIdToken())
 *
 * BASE_URL default http://localhost:3000 — set BASE_URL env to use deployed URL.
 *
 * @phase R179-2 backfill
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantArg = args.indexOf('--tenant');
const tenantId = tenantArg >= 0 ? args[tenantArg + 1] : null;
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.FIREBASE_ID_TOKEN;
const RATE_LIMIT_MS = 1000; // 1s between reprocess (worker concurrency)

if (!tenantId) {
  console.error('Usage: --tenant <id>  [--dry-run]');
  process.exit(1);
}
if (!TOKEN && !dryRun) {
  console.error('FIREBASE_ID_TOKEN env var required (run dry-run first to skip)');
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();
db.settings({ databaseId: '(default)' });

const snap = await db.collection(`tenants/${tenantId}/papers`).get();
const candidates = snap.docs.filter((d) => {
  const data = d.data();
  // Reprocess when domain missing OR taxonomy version outdated
  return (
    data.status === 'indexed' && (!data.lifecycleStatus || data.lifecycleStatus === 'active') &&
    (!data.domain || data.domain === '' || data.domainTaxonomyVersion !== 'v1')
  );
});

console.log(`tenant=${tenantId} total=${snap.size} need_classify=${candidates.length}`);

if (dryRun) {
  for (const d of candidates) {
    console.log(`  [dry] would reprocess ${d.id} title="${(d.data().title || '').slice(0, 60)}"`);
  }
  console.log(`done (dry-run).`);
  process.exit(0);
}

let success = 0;
let failed = 0;
for (const d of candidates) {
  try {
    const res = await fetch(`${BASE_URL}/api/papers/${d.id}/reprocess`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, Origin: 'http://localhost:3000' }
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`  ${d.id} ✗ ${res.status} ${err.slice(0, 100)}`);
      failed++;
    } else {
      console.log(`  ${d.id} ✓ enqueued`);
      success++;
    }
  } catch (err) {
    console.log(`  ${d.id} ✗ ${err.message}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
}

console.log(`done. success=${success} failed=${failed}`);
console.log('Worker pipeline runs async — check Firestore after ~30s/paper for domain field.');
