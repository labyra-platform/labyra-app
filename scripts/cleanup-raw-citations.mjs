/**
 * cleanup-raw-citations.mjs — delete the rubbish :r: citations created by the
 * marker-split R237bn (headings/tables/figures wrongly parsed as references).
 * After R237bo (DOI-anchored) every real reference is a :d: citation, so all
 * :r: docs are stale and safe to remove. DOI (:d:) and title (:t:) untouched.
 *   node scripts/cleanup-raw-citations.mjs --dry
 *   node scripts/cleanup-raw-citations.mjs
 */
import admin from 'firebase-admin';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'labyra-app-dev';
const TENANT = process.env.LABYRA_TENANT ?? 'tenant-dev-001';
const DRY = process.argv.includes('--dry');
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const snap = await db.collection(`tenants/${TENANT}/citations`).get();
const raw = snap.docs.filter((d) => d.id.includes(':r:'));
console.log(`tenant ${TENANT}: ${snap.size} citations, ${raw.length} are :r: (rubbish)`);
if (DRY) { console.log('--dry: nothing deleted.'); process.exit(0); }
let n = 0;
while (n < raw.length) {
  const batch = db.batch();
  for (const d of raw.slice(n, n + 400)) batch.delete(d.ref);
  await batch.commit();
  n += 400;
  console.log(`  deleted ${Math.min(n, raw.length)}/${raw.length}`);
}
console.log(`Done. Deleted ${raw.length} :r: citations. Re-run reprocess to populate clean :d: refs.`);
process.exit(0);
