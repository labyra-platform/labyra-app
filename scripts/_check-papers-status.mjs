import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ databaseId: '(default)' });

const snap = await db.collection('tenants/tenant-dev-001/papers').limit(20).get();
console.log(`Total papers: ${snap.size}`);
for (const doc of snap.docs) {
  const d = doc.data();
  console.log(`  ${doc.id}: status=${d.status} title="${(d.title||'').slice(0,50)}" doi=${d.doi||'-'} chunkCount=${d.indexedChunkCount||0} processingCompletedAt=${d.processingCompletedAt?._seconds||0}`);
}
