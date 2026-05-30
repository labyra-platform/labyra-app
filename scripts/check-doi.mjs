import admin from 'firebase-admin';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'labyra-app-dev';
const TENANT = process.env.LABYRA_TENANT ?? 'tenant-dev-001';
const TERMINAL = new Set(['indexed', 'failed', 'cancelled']);

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

const snap = await db.collection(`tenants/${TENANT}/papers`).get();
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const nonBook = all.filter((p) => p.documentType !== 'book');

const hasDoi = (p) => typeof p.doi === 'string' && p.doi.trim().length > 0;
const withDoi = nonBook.filter(hasDoi);
const withoutDoi = nonBook.filter((p) => !hasDoi(p));
const stillProcessing = nonBook.filter((p) => !TERMINAL.has(p.status));

console.log('═══════════════════════════════════════════════════════════');
console.log(`SELF-DOI COVERAGE — tenant ${TENANT}  (books excluded)`);
console.log('═══════════════════════════════════════════════════════════');
console.log(`Non-book papers:        ${nonBook.length}`);
console.log(`  with self-DOI:        ${withDoi.length}`);
console.log(`  WITHOUT self-DOI:     ${withoutDoi.length}`);
if (stillProcessing.length) {
  console.log(`  (still processing:    ${stillProcessing.length} — re-run after they finish)`);
}
const pct = nonBook.length ? ((withDoi.length / nonBook.length) * 100).toFixed(1) : '0.0';
console.log(`\nCoverage: ${withDoi.length}/${nonBook.length} = ${pct}%`);
console.log(
  withDoi.length === nonBook.length
    ? '✅ Every non-book paper has its own DOI.'
    : '⚠️  Shortfall — papers below have no self-DOI (worker gap B candidates):'
);

if (withoutDoi.length) {
  console.log('\nMissing self-DOI:');
  for (const p of withoutDoi) {
    console.log(
      `  - ${p.id}  [${p.status}]  ${(p.title || 'Untitled').slice(0, 70)}` +
        (p.title === 'Untitled' || !p.title ? '   ← Untitled' : '')
    );
  }
}

const cits = await db.collection(`tenants/${TENANT}/citations`).get();
const bySource = new Map();
cits.forEach((c) => {
  const s = c.data().sourcePaperId ?? '(none)';
  bySource.set(s, (bySource.get(s) ?? 0) + 1);
});
console.log('\n───────────────────────────────────────────────────────────');
console.log(`Reference citations (separate — tenants/${TENANT}/citations): ${cits.size}`);
console.log(`  across ${bySource.size} source papers`);
console.log('  (this is the references-inside-papers count, excluded from the self-DOI check above)');

process.exit(0);
