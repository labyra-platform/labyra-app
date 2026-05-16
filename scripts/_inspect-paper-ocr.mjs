import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'labyra-app-dev' });
const db = admin.firestore();
const tid = 'tenant-dev-001';
const pid = '8cfb9f4ed9d2870b7c461bf3eaa0f4b1';
const ref = db.doc(`tenants/${tid}/papers/${pid}`);
const snap = await ref.get();
const d = snap.data();

// Paper doc top-level fields related to OCR
console.log('--- Paper doc OCR-related fields ---');
console.log(JSON.stringify({
  status: d.status,
  version: d.version,
  pages: d.pageCount,
  hasOcrField: !!d.ocr,
  ocrKeys: d.ocr ? Object.keys(d.ocr) : null,
  hasOcrResultField: !!d.ocrResult,
  costUsd: d.costUsd,
}, null, 2));

// Subcollections
const subs = await ref.listCollections();
console.log('\n--- Subcollections ---');
for (const sub of subs) {
  const count = (await sub.count().get()).data().count;
  console.log(`  ${sub.id}: ${count} docs`);
}

// Check storage paths
console.log('\n--- Storage hints ---');
console.log('storagePath:', d.storagePath);
console.log('ocrStoragePath:', d.ocrStoragePath ?? 'not set');
console.log('chunksStoragePath:', d.chunksStoragePath ?? 'not set');

process.exit(0);
