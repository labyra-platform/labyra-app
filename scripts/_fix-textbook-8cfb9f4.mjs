import admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'labyra-app-dev' });
const db = admin.firestore();
const tid = 'tenant-dev-001';
const pid = '8cfb9f4ed9d2870b7c461bf3eaa0f4b1';
const ref = db.doc(`tenants/${tid}/papers/${pid}`);

const update = {
  title: 'Infrared and Raman Spectroscopy: Methods and Applications',
  year: 1995,
  authors: ['Bernhard Schrader'],
  isbn: '3-527-26446-9',
  publisher: 'VCH Verlagsgesellschaft mbH',
  documentType: 'book',
  metadataSource: 'manual-R176-1f-textbook',
  metadataBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
};

await ref.update(update);
console.log('OK: paper 8cfb9f4 updated');
console.log(JSON.stringify(update, null, 2));
process.exit(0);
