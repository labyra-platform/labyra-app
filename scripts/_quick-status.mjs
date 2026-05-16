import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'labyra-app-dev' });
const snap = await admin.firestore().doc('tenants/tenant-dev-001/papers/8cfb9f4ed9d2870b7c461bf3eaa0f4b1').get();
const d = snap.data();
console.log({
  status: d.status,
  version: d.version,
  chunks: d.chunkCount,
  embedded: d.embeddedChunkCount,
  indexed: d.indexedChunkCount,
  costOcr: d.costUsd?.ocr,
  costTotal: d.costUsd?.total,
  error: d.error,
  processingStartedAt: d.processingStartedAt?.toDate?.()?.toISOString(),
});
