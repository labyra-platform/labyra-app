/**
 * Test data cleanup — hard-delete measurements, samples, experiments.
 *
 * PRESERVES (never touched):
 *   - papers, citations, references, conversations  (AI / RAG data)
 *   - materialProfiles (root collection — shared knowledge base)
 *   - any other collection not in TARGET_COLLECTIONS
 *
 * Hard delete (not deprecate) because this is dev/test garbage, no audit needed.
 * Deletes subcollections too (e.g. measurements/{id}/analysis/*,
 * samples/{id}/crossSpectrum/*).
 *
 * Usage:
 *   node --env-file=.env.local scripts/_cleanup-test-data.mjs                 # dry-run
 *   node --env-file=.env.local scripts/_cleanup-test-data.mjs --apply         # delete
 *   node --env-file=.env.local scripts/_cleanup-test-data.mjs --apply --tenant tenant-dev-001
 *
 * @phase R186-test-cleanup
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
let TENANT = 'tenant-dev-001';
const tIdx = args.indexOf('--tenant');
if (tIdx >= 0 && args[tIdx + 1]) TENANT = args[tIdx + 1];

const TARGET_COLLECTIONS = ['measurements', 'samples', 'experiments'];
const PRESERVE = ['papers', 'citations', 'references', 'conversations', 'materialProfiles'];

const creds = {
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();

console.log(`Tenant: ${TENANT}`);
console.log(`Mode:   ${APPLY ? 'APPLY (will delete)' : 'DRY RUN'}`);
console.log(`Target: ${TARGET_COLLECTIONS.join(', ')}`);
console.log(`Preserve: ${PRESERVE.join(', ')} + everything else\n`);

/**
 * Recursively delete a document and all its subcollections.
 */
async function deleteDocRecursive(docRef) {
  const subcols = await docRef.listCollections();
  for (const sub of subcols) {
    const subSnap = await sub.get();
    for (const subDoc of subSnap.docs) {
      await deleteDocRecursive(subDoc.ref);
    }
  }
  await docRef.delete();
}

let grandTotal = 0;

for (const col of TARGET_COLLECTIONS) {
  const colRef = db.collection('tenants').doc(TENANT).collection(col);
  const snap = await colRef.get();
  console.log(`[${col}] ${snap.size} documents`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const labelParts = [
      d.sampleCode,
      d.experimentCode,
      d.filename,
      d.name,
      d.title,
    ].filter(Boolean);
    const label = labelParts[0] ?? doc.id;
    console.log(`    - ${doc.id}  (${label})`);

    if (APPLY) {
      await deleteDocRecursive(doc.ref);
    }
  }
  grandTotal += snap.size;
}

console.log(`\nTotal: ${grandTotal} documents`);
if (!APPLY) {
  console.log('\n=== DRY RUN — nothing deleted. Re-run with --apply to delete. ===');
} else {
  console.log('\n=== DELETED. AI/papers + materialProfiles untouched. ===');
}
process.exit(0);
