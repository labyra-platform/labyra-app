/**
 * API cost report — sums the cost Labyra SELF-TRACKS per paper (paper.costUsd).
 * Covers the paid pipeline calls: Mistral OCR, Voyage embeddings, and the
 * Gemini/Claude enrichment+classify tier. Run from the app repo:
 *     node scripts/report-cost.mjs
 * Read-only.
 *
 * NOT included (by nature): Crossref / OpenAlex(DOI) / Google Books = free;
 * Pinecone / Cloud Run / Vercel / Firestore = infrastructure billed by usage,
 * not per-call — check each provider's dashboard for those.
 */
import admin from 'firebase-admin';

const TENANT = 'tenant-dev-001';
admin.initializeApp({ projectId: 'labyra-app-dev' });
const db = admin.firestore();

const usd = (n) => '$' + n.toFixed(4);

function readCost(c) {
  // Flexible: costUsd may be a number or {ocr,embedding,enrichment,total}.
  if (typeof c === 'number') return { ocr: 0, embedding: 0, enrichment: 0, total: c, flat: c };
  if (c && typeof c === 'object') {
    const ocr = c.ocr || 0;
    const embedding = c.embedding || 0;
    const enrichment = c.enrichment || 0;
    const total = c.total != null ? c.total : ocr + embedding + enrichment;
    return { ocr, embedding, enrichment, total, flat: 0 };
  }
  return { ocr: 0, embedding: 0, enrichment: 0, total: 0, flat: 0 };
}

(async () => {
  const snap = await db.collection(`tenants/${TENANT}/papers`).get();
  let ocr = 0, emb = 0, enr = 0, tot = 0, flat = 0, withCost = 0;
  const perPaper = [];

  snap.forEach((d) => {
    const p = d.data();
    const c = readCost(p.costUsd);
    if (c.total > 0) withCost++;
    ocr += c.ocr; emb += c.embedding; enr += c.enrichment; tot += c.total; flat += c.flat;
    perPaper.push({ id: d.id, title: (p.title || '').slice(0, 45), total: c.total });
  });

  perPaper.sort((a, b) => b.total - a.total);
  const n = snap.size;

  console.log('\n══════════ API COST — ' + TENANT + ' ══════════');
  console.log('  (self-tracked pipeline cost from paper.costUsd)\n');
  console.log('  Papers total:            ' + n);
  console.log('  Papers with cost data:   ' + withCost);
  console.log('');
  console.log('  ▸ By stage / API');
  console.log('    OCR (Mistral)          ' + usd(ocr));
  console.log('    Embedding (Voyage)     ' + usd(emb));
  console.log('    Enrichment (Gemini/Claude) ' + usd(enr));
  if (flat > 0) console.log('    Unattributed (flat costUsd) ' + usd(flat));
  console.log('    ─────────────────────────────');
  console.log('    TOTAL                  ' + usd(tot));
  console.log('');
  console.log('  ▸ Per paper');
  console.log('    Average                ' + usd(n ? tot / n : 0));
  console.log('    Most expensive:');
  perPaper.slice(0, 5).forEach((p) =>
    console.log('      ' + usd(p.total).padStart(9) + '  ' + p.title)
  );
  console.log('');
  console.log('  ℹ Free (not counted): Crossref, OpenAlex (DOI lookup), Google Books.');
  console.log('  ℹ Infra (see provider dashboards): Pinecone, Cloud Run, Vercel, Firestore.');
  console.log('');
  process.exit(0);
})();
