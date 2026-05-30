import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import { PubSub } from '@google-cloud/pubsub';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'labyra-app-dev';
const TENANT = process.env.LABYRA_TENANT ?? 'tenant-dev-001';
const TOPIC = process.env.PUBSUB_PAPER_TOPIC ?? 'paper-processing';
const TERMINAL = new Set(['indexed', 'failed', 'cancelled']);
const DRY = process.argv.includes('--dry');

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const pubsub = new PubSub({ projectId: PROJECT });

const snap = await db.collection(`tenants/${TENANT}/papers`).get();
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const books = all.filter((p) => p.documentType === 'book');
const candidates = all.filter((p) => p.documentType !== 'book');
const eligible = candidates.filter((p) => TERMINAL.has(p.status));
const skipped = candidates.filter((p) => !TERMINAL.has(p.status));

console.log(`Tenant ${TENANT}: ${all.length} papers total`);
console.log(`  books (skipped):              ${books.length}`);
console.log(`  non-book mid-flight (skipped):${skipped.length}`);
console.log(`  non-book eligible to reprocess:${eligible.length}`);
if (skipped.length) {
  console.log('  (mid-flight, not terminal):');
  for (const p of skipped) console.log(`    - ${p.id}  [${p.status}]  ${(p.title || 'Untitled').slice(0, 60)}`);
}
if (DRY) {
  console.log('\n--dry: nothing published.');
  process.exit(0);
}

let done = 0;
for (const p of eligible) {
  const nextVersion = (p.version ?? 0) + 1;
  await db.doc(`tenants/${TENANT}/papers/${p.id}`).update({
    status: 'queued',
    version: admin.firestore.FieldValue.increment(1),
    statusUpdatedAt: admin.firestore.Timestamp.now(),
    error: '',
    cancelRequestedAt: 0,
    retryCount: 0,
    chunkCount: 0,
    enrichedChunkCount: 0,
    embeddedChunkCount: 0,
    indexedChunkCount: 0,
    costUsd: { ocr: 0, enrichment: 0, embedding: 0, total: 0 },
    processingStartedAt: 0,
    processingCompletedAt: 0,
    totalLatencyMs: 0
  });

  const message = {
    jobId: randomUUID(),
    tenantId: TENANT,
    paperId: p.id,
    version: nextVersion,
    storagePath: p.storagePath,
    createdBy: p.createdBy ?? p.uploadedBy ?? 'reprocess-script',
    enqueuedAt: Date.now()
  };
  const messageId = await pubsub.topic(TOPIC).publishMessage({
    data: Buffer.from(JSON.stringify(message)),
    attributes: { tenantId: TENANT, paperId: p.id }
  });
  done++;
  console.log(`  ✓ ${p.id}  v${nextVersion}  msg=${messageId}  ${(p.title || 'Untitled').slice(0, 50)}`);
}

console.log(`\nPublished ${done} reprocess jobs to topic "${TOPIC}".`);
console.log('Wait for the worker to finish, then run:  node scripts/check-doi.mjs');
process.exit(0);
