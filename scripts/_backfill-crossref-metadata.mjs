#!/usr/bin/env node
/**
 * Backfill paper metadata via Crossref title search.
 * @phase R176-1f
 *
 * Target: papers với year=0 và không có DOI. Query Crossref bằng title +
 * (optional) first author. Lấy top match, verify title similarity ≥ threshold.
 * Update Firestore: year, doi, metadataSource='crossref-title-search'.
 *
 * Trust > Coverage: nếu fuzzy match < 0.6 → SKIP, không hallucinate.
 *
 * Run:
 *   FIRESTORE_DATABASE_ID="(default)" \
 *     GOOGLE_APPLICATION_CREDENTIALS=... \
 *     GCP_PROJECT_ID=labyra-app-dev \
 *     node scripts/_backfill-crossref-metadata.mjs --tenant tenant-dev-001 [--dry]
 *
 * Options:
 *   --tenant <tid>     Required
 *   --ids <csv>        Optional, override auto-discovery
 *   --dry              Print without updating
 *   --threshold <f>    Title similarity threshold, default 0.6
 *   --mailto <email>   Crossref polite pool email
 */

import admin from 'firebase-admin';
import process from 'node:process';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const tenant = arg('tenant');
const idsRaw = arg('ids');
const dry = arg('dry', false) === true;
const threshold = parseFloat(arg('threshold', '0.6'));
const mailto = arg('mailto', process.env.CROSSREF_POLITE_MAILTO || 'admin@labyra.dev');

if (!tenant) {
  console.error('ERROR: --tenant required');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'labyra-app-dev' });
}
const db = admin.firestore();

// ───── Title similarity (Jaccard on word sets) ─────
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function jaccard(a, b) {
  const A = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return inter / union;
}

// ───── Crossref API ─────
async function crossrefSearch(title, firstAuthor) {
  const params = new URLSearchParams({
    'query.bibliographic': title,
    rows: '5',
    mailto,
  });
  if (firstAuthor) {
    params.set('query.author', firstAuthor);
  }
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `Labyra/R176-1f (${mailto})` },
  });
  if (!res.ok) throw new Error(`Crossref ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data?.message?.items ?? [];
}

function extractYearFromCrossref(item) {
  // Crossref date fields priority: published > issued > created
  const candidates = [
    item.published?.['date-parts']?.[0]?.[0],
    item.issued?.['date-parts']?.[0]?.[0],
    item['published-print']?.['date-parts']?.[0]?.[0],
    item['published-online']?.['date-parts']?.[0]?.[0],
    item.created?.['date-parts']?.[0]?.[0],
  ];
  for (const y of candidates) {
    if (typeof y === 'number' && y >= 1900 && y <= 2100) return y;
  }
  return null;
}

// ───── Per-paper backfill ─────
async function backfillPaper(paperId, paperData) {
  const title = paperData.title;
  const firstAuthor = Array.isArray(paperData.authors) && paperData.authors[0]
    ? String(paperData.authors[0]).split(/[\s,]+/)[0]  // surname-ish
    : null;

  if (!title || title === 'Untitled' || title.length < 10) {
    return { skip: 'title-too-short', title };
  }

  let items;
  try {
    items = await crossrefSearch(title, firstAuthor);
  } catch (e) {
    return { skip: 'crossref-error', error: String(e) };
  }
  if (!items.length) return { skip: 'no-results', title };

  // Find best match by title similarity
  let best = null;
  for (const item of items) {
    const candidateTitle = Array.isArray(item.title) ? item.title[0] : item.title;
    if (!candidateTitle) continue;
    const score = jaccard(title, candidateTitle);
    if (!best || score > best.score) {
      best = { item, candidateTitle, score };
    }
  }

  if (!best || best.score < threshold) {
    return {
      skip: 'low-similarity',
      bestScore: best?.score ?? 0,
      bestTitle: best?.candidateTitle ?? null,
      origTitle: title,
    };
  }

  const year = extractYearFromCrossref(best.item);
  const doi = best.item.DOI ?? null;
  const crossrefTitle = best.candidateTitle;
  const crossrefAuthors = Array.isArray(best.item.author)
    ? best.item.author.map((a) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean)
    : null;

  if (!year && !doi) {
    return { skip: 'no-useful-data', score: best.score };
  }

  return {
    match: true,
    score: best.score,
    crossrefTitle,
    year,
    doi,
    crossrefAuthors,
  };
}

// ───── Discovery ─────
async function findCandidates() {
  if (idsRaw) {
    return idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const snap = await db.collection(`tenants/${tenant}/papers`).get();
  const out = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const year = d.year ?? d.metadata?.year;
    const validYear = typeof year === 'number' && year >= 1900 && year <= 2100;
    if (!validYear) out.push(doc.id);
  }
  return out;
}

// ───── Main ─────
async function main() {
  console.log(`\n=== R176-1f Crossref Backfill ===`);
  console.log(`Tenant:    ${tenant}`);
  console.log(`Dry:       ${dry}`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Mailto:    ${mailto}\n`);

  const candidates = await findCandidates();
  console.log(`Candidates: ${candidates.length}\n`);

  let updated = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < candidates.length; i++) {
    const pid = candidates[i];
    const shortId = pid.slice(0, 16);
    const ref = db.doc(`tenants/${tenant}/papers/${pid}`);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`[${i + 1}/${candidates.length}] ${shortId}: NOT FOUND`);
      failures.push({ id: pid, reason: 'not-found' });
      continue;
    }
    const data = snap.data();
    const titlePreview = (data.title || '').slice(0, 60);
    process.stdout.write(`[${i + 1}/${candidates.length}] ${shortId} "${titlePreview}..." `);

    const result = await backfillPaper(pid, data);

    if (result.skip) {
      console.log(`SKIP ${result.skip}` + (result.bestScore ? ` (best=${result.bestScore.toFixed(2)})` : ''));
      skipped++;
      // Mark metadataSource so future re-runs don't loop forever
      if (!dry) {
        await ref.update({
          metadataSource: `crossref-${result.skip}`,
          metadataBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      continue;
    }

    console.log(`MATCH score=${result.score.toFixed(2)} year=${result.year || 'none'} doi=${result.doi || 'none'}`);
    if (result.crossrefTitle !== data.title) {
      console.log(`    crossref title: "${result.crossrefTitle.slice(0, 80)}..."`);
    }

    if (dry) {
      updated++;
      continue;
    }

    // Build update payload — only set fields with new data, don't overwrite good data
    const update = {
      metadataSource: 'crossref-title-search',
      metadataBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
      metadataCrossrefMatchScore: result.score,
    };
    if (result.year && (!data.year || data.year === 0)) update.year = result.year;
    if (result.doi && !data.doi) update.doi = result.doi;
    // Authors: only overwrite if current authors look like Haiku junk (single-word, all-caps, or empty)
    if (result.crossrefAuthors?.length && (!Array.isArray(data.authors) || data.authors.length === 0)) {
      update.authors = result.crossrefAuthors;
    }

    try {
      await ref.update(update);
      updated++;
    } catch (e) {
      console.log(`    UPDATE FAIL: ${e.message}`);
      failures.push({ id: pid, reason: 'update-error', error: String(e) });
    }

    // Rate limit Crossref: 50 req/sec polite pool, easily under with ~200ms delay
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n=== Result ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failures.length}`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f.id.slice(0, 16)}: ${f.reason}`));
  }

  if (!dry && updated > 0) {
    console.log(`\nNext: re-run audit`);
    console.log(`  node scripts/_audit-paper-metadata.mjs --tenant ${tenant}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
