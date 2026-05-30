/**
 * Papers status report — one-shot snapshot of the whole module.
 * Run from the app repo:  node scripts/report-status.mjs
 * Read-only. Tenant fixed below.
 */
import admin from 'firebase-admin';

const TENANT = 'tenant-dev-001';
admin.initializeApp({ projectId: 'labyra-app-dev' });
const db = admin.firestore();

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';
const bar = (label, n, d) =>
  `  ${label.padEnd(26)} ${String(n).padStart(4)}  ${d ? `(${pct(n, d)})` : ''}`;
const top = (map, k = 12) =>
  Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, k);

// crude publisher normalizer (mirror of app normalizePublisher) for the report
function normPub(p) {
  let s = (p || '').trim();
  if (!s) return '';
  s = s
    .replace(
      /[\s,]+(B\.?V\.?|Ltd\.?|Limited|Inc\.?|LLC|GmbH|AG|S\.?A\.?|Co\.?|Company|Corp\.?|Corporation|Press|Publishing|Publications|Publishers?|Group|International)\.?$/gi,
      ''
    )
    .trim();
  const A = {
    'elsevier': 'Elsevier', 'elsevier science': 'Elsevier',
    'royal society of chemistry': 'Royal Society of Chemistry',
    'american chemical society': 'American Chemical Society',
    'springer': 'Springer', 'springer nature': 'Springer Nature', 'nature': 'Springer Nature',
    'wiley': 'Wiley', 'john wiley & sons': 'Wiley', 'wiley-vch': 'Wiley',
    'iop': 'IOP Publishing', 'institute of physics': 'IOP Publishing',
    'taylor & francis': 'Taylor & Francis', 'mdpi': 'MDPI', 'aip': 'AIP Publishing'
  };
  return A[s.toLowerCase()] ?? s;
}

(async () => {
  const snap = await db.collection(`tenants/${TENANT}/papers`).get();
  const papers = snap.docs.map((d) => d.data());
  const total = papers.length;
  const books = papers.filter((p) => p.documentType === 'book').length;
  const nonBook = papers.filter((p) => p.documentType !== 'book');

  const byStatus = {};
  const byField = {};
  const byDomain = {};
  const pubRaw = {};
  const pubNorm = {};
  let withDoi = 0, vTrue = 0, vFalse = 0, vUndef = 0, withField = 0, withDomain = 0;

  for (const p of papers) byStatus[p.status || '?'] = (byStatus[p.status || '?'] || 0) + 1;
  for (const p of nonBook) {
    if ((p.doi || '').trim()) withDoi++;
    if (p.doiVerified === true) vTrue++;
    else if (p.doiVerified === false) vFalse++;
    else vUndef++;
    const f = (p.openalexField || '').trim();
    if (f) { withField++; byField[f] = (byField[f] || 0) + 1; }
    const dm = (p.domain || '').trim();
    if (dm && dm !== 'unknown') { withDomain++; byDomain[dm] = (byDomain[dm] || 0) + 1; }
    const pr = (p.publisher || '').trim();
    if (pr) { pubRaw[pr] = (pubRaw[pr] || 0) + 1; const pn = normPub(pr); pubNorm[pn] = (pubNorm[pn] || 0) + 1; }
  }

  const cit = await db.collection(`tenants/${TENANT}/citations`).get();

  console.log('\n══════════ PAPERS STATUS — ' + TENANT + ' ══════════');
  console.log('\n▸ Library');
  console.log(bar('Total papers', total));
  console.log(bar('Books', books, total));
  console.log(bar('Non-book (articles)', nonBook.length, total));
  console.log('\n▸ Processing status');
  for (const [k, v] of top(byStatus)) console.log(bar(k, v, total));
  console.log('\n▸ DOI (non-book)');
  console.log(bar('With DOI', withDoi, nonBook.length));
  console.log(bar('Verified ✓', vTrue, nonBook.length));
  console.log(bar('Unverified ⚠ (check!)', vFalse, nonBook.length));
  console.log(bar('Not yet checked', vUndef, nonBook.length));
  console.log('\n▸ OpenAlex classification (non-book)');
  console.log(bar('With field', withField, nonBook.length));
  for (const [k, v] of top(byField)) console.log(bar('  · ' + k, v, withField));
  console.log('\n▸ Gemini taxonomy (non-book)');
  console.log(bar('With domain', withDomain, nonBook.length));
  for (const [k, v] of top(byDomain, 8)) console.log(bar('  · ' + k, v, withDomain));
  console.log('\n▸ Publisher (raw → normalized)');
  console.log('  RAW:');
  for (const [k, v] of top(pubRaw)) console.log(bar('  · ' + k, v));
  console.log('  NORMALIZED:');
  for (const [k, v] of top(pubNorm)) console.log(bar('  · ' + k, v));
  console.log('\n▸ Citations (references inside papers)');
  console.log(bar('Total citation records', cit.size));
  console.log(bar('Source papers', new Set(cit.docs.map((d) => d.data().sourcePaperId)).size));

  if (vFalse > 0) {
    console.log('\n⚠ Papers with UNVERIFIED DOI (fix these):');
    for (const p of nonBook)
      if (p.doiVerified === false)
        console.log('   - ' + (p.doi || '') + '  |  ' + (p.title || '').slice(0, 50));
  }
  console.log('');
  process.exit(0);
})();
