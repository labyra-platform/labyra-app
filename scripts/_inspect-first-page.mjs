import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'labyra-app-dev' });
const tid = 'tenant-dev-001';
const pid = process.argv[2] ?? '0981405378e26c375d5a907268ba5774ba4f4a72fed1e30dbefde68fb4af70fb';
const db = admin.firestore();
// Try chunks subcollection - chunk 0 usually = first page
const chunksSnap = await db.collection(`tenants/${tid}/papers/${pid}/chunks`).limit(2).get();
for (const doc of chunksSnap.docs) {
  const d = doc.data();
  const text = d.text || d.contextual_text || '';
  console.log(`\n--- Chunk ${d.chunkIdx ?? doc.id} (pages=${JSON.stringify(d.pages)}) ---`);
  console.log(text.slice(0, 1500));
  // Year regex test
  const yearMatch = text.match(/\b(19\d{2}|20[0-3]\d)\b/g);
  console.log(`\n[regex matches: ${yearMatch ? yearMatch.slice(0,5).join(', ') : 'NONE'}]`);
}
process.exit(0);
