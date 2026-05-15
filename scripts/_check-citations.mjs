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
const snap = await db.collection('tenants/tenant-dev-001/citations').limit(10).get();
console.log(`Total citations: ${snap.size}`);
for (const doc of snap.docs) {
  const d = doc.data();
  console.log(`  ${doc.id}: source=${d.sourcePaperId} target=${d.targetDoi || d.targetTitle} confidence=${d.confidence}`);
}
