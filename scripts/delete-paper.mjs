/**
 * delete-paper.mjs — HARD delete one paper everywhere.
 *   Firestore: paper doc + all subcollections + its citations (sourcePaperId)
 *   Pinecone:  chunk vectors  {paperId}-0 .. {paperId}-(N-1)  in namespace=tenant
 *   Storage:   the uploaded PDF (paper.storagePath)
 *
 *   node scripts/delete-paper.mjs <paperId>            # DRY RUN (shows what it would delete)
 *   node scripts/delete-paper.mjs <paperId> --confirm  # actually delete
 *
 * Auth: Application Default Credentials. Pinecone needs PINECONE_API_KEY in env
 * (and optionally PINECONE_INDEX, default 'labyra-papers').
 */
import admin from 'firebase-admin';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'labyra-app-dev';
const TENANT = process.env.LABYRA_TENANT ?? 'tenant-dev-001';
const INDEX = process.env.PINECONE_INDEX ?? 'labyra-papers';
const PID = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');

if (!PID || PID.startsWith('--')) {
  console.error('Usage: node scripts/delete-paper.mjs <paperId> [--confirm]');
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

const paperRef = db.doc(`tenants/${TENANT}/papers/${PID}`);
const snap = await paperRef.get();
if (!snap.exists) {
  console.error(`Paper ${PID} not found in tenant ${TENANT}. Aborting.`);
  process.exit(1);
}
const p = snap.data();
const chunkN = Math.max(p.chunkCount || 0, p.indexedChunkCount || 0, p.embeddedChunkCount || 0);

const cits = await db.collection(`tenants/${TENANT}/citations`).where('sourcePaperId', '==', PID).get();

console.log('─────────────────────────────────────────────');
console.log('WILL DELETE:');
console.log('  title      :', p.title);
console.log('  paperId    :', PID);
console.log('  status     :', p.status, '| doi:', JSON.stringify(p.doi));
console.log('  citations  :', cits.size);
console.log('  chunk vecs :', chunkN, `(ids ${PID}-0 .. ${PID}-${chunkN - 1})`);
console.log('  storagePath:', p.storagePath || '(none)');
console.log('─────────────────────────────────────────────');

if (!CONFIRM) {
  console.log('DRY RUN — nothing deleted. Re-run with --confirm to delete.');
  process.exit(0);
}

// 1) citations
let n = 0;
while (n < cits.docs.length) {
  const batch = db.batch();
  for (const d of cits.docs.slice(n, n + 400)) batch.delete(d.ref);
  await batch.commit();
  n += 400;
}
console.log(`✓ deleted ${cits.size} citations`);

// 2) Pinecone vectors
if (chunkN > 0 && process.env.PINECONE_API_KEY) {
  try {
    const { Pinecone } = await import('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const idx = pc.index(INDEX).namespace(TENANT);
    const ids = Array.from({ length: chunkN }, (_, i) => `${PID}-${i}`);
    for (let i = 0; i < ids.length; i += 1000) await idx.deleteMany(ids.slice(i, i + 1000));
    console.log(`✓ deleted ${ids.length} Pinecone vectors (namespace ${TENANT})`);
  } catch (e) {
    console.warn('⚠ Pinecone delete failed — clean manually:', e.message);
  }
} else {
  console.warn('⚠ skipped Pinecone (no chunks or PINECONE_API_KEY unset) — clean manually if needed');
}

// 3) Storage PDF
if (p.storagePath) {
  try {
    await admin.storage().bucket().file(p.storagePath).delete();
    console.log('✓ deleted storage file');
  } catch (e) {
    console.warn('⚠ storage delete failed:', e.message);
  }
}

// 4) paper doc + all subcollections (chunks/_stats/_debug/...)
await db.recursiveDelete(paperRef);
console.log('✓ deleted paper doc + subcollections');
console.log('DONE.');
process.exit(0);
