/**
 * Read materialProfiles/MoS2 and dump its full structure for inspection.
 *
 * Usage:
 *   node --env-file=.env.local scripts/_read-mos2-profile.mjs
 *
 * @phase R186-citation-fix (inspect)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const creds = {
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();

const snap = await db.collection('materialProfiles').doc('MoS2').get();
if (!snap.exists) {
  console.log('MoS2 doc NOT FOUND');
  process.exit(1);
}
const data = snap.data();
console.log(JSON.stringify(data, null, 2));
process.exit(0);
