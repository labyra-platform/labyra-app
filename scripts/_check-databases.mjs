import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};

for (const dbId of ['labbook', '(default)', 'labyra-app-dev']) {
  // Fresh app per database
  const appName = `check-${dbId.replace(/[()]/g, '')}`;
  const app = initializeApp({ credential: cert(creds) }, appName);
  try {
    const db = getFirestore(app, dbId);
    const snap = await db.collection('tenants').limit(5).get();
    console.log(`✓ ${dbId}: ${snap.size} tenants found`);
    for (const doc of snap.docs) {
      const refCards = await db.collection(`tenants/${doc.id}/reference_cards`).limit(1).get();
      const spectra = await db.collection(`tenants/${doc.id}/spectra`).limit(1).get();
      const refs = await db.collection(`tenants/${doc.id}/references`).limit(1).get();
      const measurements = await db.collection(`tenants/${doc.id}/measurements`).limit(1).get();
      console.log(`  tenant=${doc.id}: reference_cards=${refCards.size > 0 ? 'YES' : 'no'} spectra=${spectra.size > 0 ? 'YES' : 'no'} references=${refs.size > 0 ? 'YES' : 'no'} measurements=${measurements.size > 0 ? 'YES' : 'no'}`);
    }
  } catch (e) {
    console.log(`✗ ${dbId}: ${e.message.slice(0, 100)}`);
  }
  await deleteApp(app);
}
