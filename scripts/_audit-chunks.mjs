import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'labyra-app-dev' });
const db = admin.firestore();
const tid = 'tenant-dev-001';
const snap = await db.collection(`tenants/${tid}/papers`).get();
const rows = [];
for (const doc of snap.docs) {
  const d = doc.data();
  const chunkCount = d.chunkCount ?? d.indexing?.chunkCount ?? d.indexedChunkCount ?? 0;
  const pages = d.pageCount ?? d.metadata?.pages ?? d.ocr?.pages ?? 0;
  rows.push({
    id: doc.id.slice(0, 16),
    status: d.status,
    pages,
    chunks: chunkCount,
    voyage_risk: chunkCount > 117 ? 'OVER_120K' : 'ok',
    year: d.year ?? d.metadata?.year,
  });
}
rows.sort((a, b) => b.chunks - a.chunks);
console.table(rows);
process.exit(0);
