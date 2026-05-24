/**
 * backfill-paper-year.mjs  (Labyra R199c — backfill ONLY `year` for papers year=0)
 *
 * Hẹp & an toàn: chỉ nhắm paper year=0, CHỈ ghi `year` (không đụng journal/doi/authors).
 * Kế thừa logic _backfill-crossref-metadata.mjs (Jaccard ≥ threshold, Trust>Coverage).
 *
 * Khác bản cũ:
 *  - auth bằng GOOGLE_APPLICATION_CREDENTIALS (đồng bộ các script khác của repo)
 *  - chỉ set field `year` + metadataYearBackfilledAt (không overwrite metadata khác)
 *  - bỏ qua textbook / title rỗng (manual source)
 *  - dry-run mặc định IN year tìm được để soi paper nào Crossref có date / không
 *
 * Run (từ repo root):
 *   export GOOGLE_APPLICATION_CREDENTIALS="$(ls /mnt/d/labbook-patches/*firebase*.json)"
 *   node scripts/backfill-paper-year.mjs                 # dry-run
 *   node scripts/backfill-paper-year.mjs --apply         # ghi year
 *   node scripts/backfill-paper-year.mjs --apply --tenant tenant-dev-001
 */

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const tIdx = args.indexOf('--tenant');
const TENANT = tIdx >= 0 ? args[tIdx + 1] : 'tenant-dev-001';
const thrIdx = args.indexOf('--threshold');
const THRESHOLD = thrIdx >= 0 ? parseFloat(args[thrIdx + 1]) : 0.6;
const MAILTO = process.env.CROSSREF_POLITE_MAILTO || 'admin@labyra.dev';

// ── credential ──
const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.LABYRA_SA_KEY ||
  'serviceAccountKey.json';
if (!existsSync(keyPath)) {
  console.error('✗ Không thấy SA key. Set GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(keyPath, 'utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ── title similarity (Jaccard, kế thừa backfill cũ) ──
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function jaccard(a, b) {
  const A = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

async function crossrefSearch(title, firstAuthor) {
  const params = new URLSearchParams({ 'query.bibliographic': title, rows: '5', mailto: MAILTO });
  if (firstAuthor) params.set('query.author', firstAuthor);
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': `Labyra/R199c (${MAILTO})` } });
  if (!res.ok) throw new Error(`Crossref ${res.status}`);
  const data = await res.json();
  return data?.message?.items ?? [];
}

function extractYear(item) {
  const c = [
    item.published?.['date-parts']?.[0]?.[0],
    item.issued?.['date-parts']?.[0]?.[0],
    item['published-print']?.['date-parts']?.[0]?.[0],
    item['published-online']?.['date-parts']?.[0]?.[0],
    item.created?.['date-parts']?.[0]?.[0]
  ];
  for (const y of c) if (typeof y === 'number' && y >= 1900 && y <= 2100) return y;
  return null;
}

function isManualOrTextbook(d) {
  const src = String(d.metadataSource || '');
  const title = String(d.title || '');
  return (
    src.includes('textbook') ||
    src.includes('manual') ||
    !title ||
    title === 'Untitled' ||
    title.length < 10
  );
}

async function main() {
  console.log('='.repeat(60));
  console.log(`R199c backfill YEAR  ${APPLY ? '[APPLY]' : '[DRY-RUN]'}`);
  console.log(`tenant=${TENANT} threshold=${THRESHOLD} mailto=${MAILTO}`);
  console.log('='.repeat(60));

  const snap = await db.collection(`tenants/${TENANT}/papers`).get();
  const targets = snap.docs.filter((d) => {
    const y = d.data().year;
    return !(typeof y === 'number' && y >= 1900 && y <= 2100);
  });
  console.log(`Paper year=0/thiếu: ${targets.length}\n`);

  let found = 0, written = 0, skipManual = 0, skipNoData = 0, skipLow = 0;

  for (const doc of targets) {
    const d = doc.data();
    const short = doc.id.slice(0, 8);
    const titlePrev = (d.title || '').slice(0, 55);

    if (isManualOrTextbook(d)) {
      console.log(`  ${short} SKIP (manual/textbook/no-title) "${titlePrev}"`);
      skipManual++;
      continue;
    }

    const firstAuthor =
      Array.isArray(d.authors) && d.authors[0]
        ? String(d.authors[0]).split(/[\s,]+/)[0]
        : null;

    let items;
    try {
      items = await crossrefSearch(d.title, firstAuthor);
    } catch (e) {
      console.log(`  ${short} crossref-error ${e.message}`);
      skipNoData++;
      continue;
    }

    let best = null;
    for (const it of items) {
      const ct = Array.isArray(it.title) ? it.title[0] : it.title;
      if (!ct) continue;
      const score = jaccard(d.title, ct);
      if (!best || score > best.score) best = { it, ct, score };
    }

    if (!best || best.score < THRESHOLD) {
      console.log(`  ${short} SKIP low-sim (best=${(best?.score ?? 0).toFixed(2)}) "${titlePrev}"`);
      skipLow++;
      continue;
    }

    const year = extractYear(best.it);
    if (!year) {
      console.log(`  ${short} match score=${best.score.toFixed(2)} nhưng Crossref KHÔNG có year "${titlePrev}"`);
      skipNoData++;
      continue;
    }

    found++;
    console.log(`  ${short} → year=${year} (score=${best.score.toFixed(2)}) "${titlePrev}"`);

    if (APPLY) {
      await doc.ref.update({
        year,
        metadataYearBackfilledAt: FieldValue.serverTimestamp(),
        metadataYearSource: 'crossref-title-search-R199c'
      });
      written++;
    }
    await new Promise((r) => setTimeout(r, 250)); // polite pool
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`year tra được   : ${found}`);
  if (APPLY) console.log(`đã ghi year     : ${written}`);
  console.log(`skip manual/book: ${skipManual}`);
  console.log(`skip no-data    : ${skipNoData}  (Crossref không có date hoặc lỗi)`);
  console.log(`skip low-sim    : ${skipLow}`);
  console.log('-'.repeat(60));
  if (!APPLY) console.log('\nDRY-RUN. Chạy lại với --apply để ghi year.');
  else console.log('\n✓ Xong. Paper còn year=0 là không tra được — fix logic filter sẽ ẩn khi lọc năm.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
