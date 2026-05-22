#!/usr/bin/env node
/**
 * round-192-10-backfill-pinecone-groupid.mjs — TEAM-5 B3 (ADR-034)
 *
 * Stamp groupId onto Pinecone metadata of ALREADY-INDEXED chunks (no re-embed).
 *
 * For each paper in a tenant:
 *   1. read paper.groupId from Firestore (default 'lab-shared' if missing)
 *   2. list chunk docs at tenants/{tid}/papers/{pid}/chunks/* — each doc id IS
 *      the Pinecone vector id ({paperId}-{chunkIdx}, worker convention)
 *   3. for each chunk id → pinecone ns.update({ id, metadata: { groupId } })
 *
 * Reading real chunk ids from Firestore (not derived from chunkCount) means we
 * match the EXACT vector ids in Pinecone, even with gaps.
 *
 * Usage (from labyra-app root; needs ADC + PINECONE_API_KEY in env/.env.local):
 *   node scripts/round-192-10-backfill-pinecone-groupid.mjs           # DRY RUN
 *   node scripts/round-192-10-backfill-pinecone-groupid.mjs --apply   # writes
 *
 * Scoped to MIGRATE_TENANT_ID (default tenant-dev-001). --all-tenants to sweep.
 *
 * SAFETY: metadata-only partial update. Does NOT touch vector values, does NOT
 * delete anything. Idempotent — re-running sets the same groupId.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Pinecone } from '@pinecone-database/pinecone';

const APPLY = process.argv.includes('--apply');
const ALL_TENANTS = process.argv.includes('--all-tenants');
const TENANT_ID = process.env.MIGRATE_TENANT_ID ?? 'tenant-dev-001';
const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? 'labyra-papers';
const LAB_SHARED = 'lab-shared';

const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey || !apiKey.startsWith('pcsk_')) {
  console.error('[backfill] PINECONE_API_KEY missing/malformed (expected pcsk_...). Set in env/.env.local');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();
const pc = new Pinecone({ apiKey });
const index = pc.index(INDEX_NAME);

async function tenantIds() {
  if (!ALL_TENANTS) return [TENANT_ID];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

async function run() {
  console.log(`[backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenants=${ALL_TENANTS ? 'ALL' : TENANT_ID} index=${INDEX_NAME}`);
  let papers = 0;
  let chunksTotal = 0;
  let updated = 0;
  let errors = 0;

  for (const tid of await tenantIds()) {
    const ns = index.namespace(tid);
    const papersSnap = await db.collection(`tenants/${tid}/papers`).get();

    for (const paperDoc of papersSnap.docs) {
      papers++;
      const paper = paperDoc.data();
      const pid = paperDoc.id;
      const groupId = typeof paper.groupId === 'string' && paper.groupId.length > 0
        ? paper.groupId
        : LAB_SHARED;

      const chunksSnap = await db.collection(`tenants/${tid}/papers/${pid}/chunks`).get();
      const chunkIds = chunksSnap.docs.map((d) => d.id); // = Pinecone vector ids
      chunksTotal += chunkIds.length;

      console.log(`  [${tid}] ${pid} groupId=${groupId} chunks=${chunkIds.length} "${(paper.title ?? '').slice(0, 50)}"`);

      if (!APPLY) continue;

      for (const id of chunkIds) {
        try {
          await ns.update({ id, metadata: { groupId } });
          updated++;
        } catch (e) {
          errors++;
          console.error(`    ✗ update failed id=${id}: ${e?.message ?? e}`);
        }
      }
    }
  }

  console.log(`\n[backfill] papers=${papers} chunks=${chunksTotal} updated=${updated} errors=${errors}`);
  if (!APPLY) {
    console.log('[backfill] DRY-RUN only. Re-run with --apply to write metadata.');
  } else if (errors === 0) {
    console.log('[backfill] done, 0 errors. Next: VERIFY (query a few vectors for groupId), then B4 filter.');
  } else {
    console.log('[backfill] completed WITH ERRORS — investigate before B4 filter.');
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('[backfill] FATAL:', e);
  process.exit(1);
});
