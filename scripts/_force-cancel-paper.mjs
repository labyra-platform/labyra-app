import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ databaseId: '(default)' });

const PAPER_ID = process.argv[2];
if (!PAPER_ID) { console.error('Usage: node _force-cancel-paper.mjs <paperId>'); process.exit(1); }

await db.doc(`tenants/tenant-dev-001/papers/${PAPER_ID}`).update({
  status: 'cancelled',
  statusUpdatedAt: Timestamp.now()
});
console.log(`✓ Cancelled paper ${PAPER_ID}`);
