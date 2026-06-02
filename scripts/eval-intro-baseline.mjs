/**
 * eval-intro-baseline.mjs — baseline quality of generated Introductions.
 *
 * Reads the saved manuscripts for a tenant, scores each manuscript's
 * Introduction section against the citation keys the Writer was given
 * (section.citations), and prints a baseline report. No regeneration, no API
 * call, no token — pure read of what's already been generated, so it is cheap
 * and reproducible. Run it once now (baseline), then again after the Tier-1/2
 * Introduction upgrades and compare the SAME numbers.
 *
 * Headline signal: `fabricatedCitations` (cited [key] mapping to no real source
 * = R276 invalid citation, recomputed). Weak retrieval inflates it; the topic-
 * query + funnel changes should drive it toward 0.
 *
 * Usage:
 *   FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... \
 *   FIREBASE_ADMIN_PRIVATE_KEY='...' TENANT_ID=<tid> \
 *   [MANUSCRIPT_IDS=id1,id2] node scripts/eval-intro-baseline.mjs
 *
 * Prereq: generate the Introduction for a few manuscripts first (varied topics)
 * so there is something to measure.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { analyzeIntro } from './lib/intro-metrics.mjs';

const TENANT_ID = process.env.TENANT_ID;
if (!TENANT_ID) {
  console.error('ERROR: set TENANT_ID');
  process.exit(1);
}
const ONLY_IDS = (process.env.MANUSCRIPT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

initializeApp({
  credential: cert({
    project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  })
});
const db = getFirestore();

function avg(nums) {
  return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : 0;
}

async function main() {
  const snap = await db.collection(`tenants/${TENANT_ID}/manuscripts`).get();
  const rows = [];
  let skipped = 0;

  for (const doc of snap.docs) {
    const m = doc.data();
    if (ONLY_IDS.length > 0 && !ONLY_IDS.includes(doc.id)) continue;
    if (m.lifecycleStatus === 'retracted' || m.lifecycleStatus === 'deprecated') continue;

    const intro = (m.sections ?? []).find((s) => s.type === 'introduction');
    if (!intro || !intro.content || !intro.content.trim()) {
      skipped += 1;
      continue;
    }
    const validKeys = (intro.citations ?? []).map((c) => c.citationKey).filter(Boolean);
    const metrics = analyzeIntro(intro.content, validKeys);
    rows.push({ id: doc.id, title: m.title ?? '(untitled)', ...metrics });
  }

  if (rows.length === 0) {
    console.log(
      `\nNo generated Introductions found for tenant ${TENANT_ID} (skipped ${skipped} manuscript(s) with no intro).\n` +
        'Generate the Introduction for a few manuscripts first, then re-run.'
    );
    return;
  }

  console.log(`\n# Introduction baseline — tenant ${TENANT_ID}\n`);
  console.log(`Manuscripts scored: ${rows.length}  (skipped, no intro: ${skipped})\n`);
  console.log(
    '| Manuscript | Words | Cited | Fabricated | Cite/Sentence | Claims no-cite | Pivot |'
  );
  console.log('|---|---:|---:|---:|---:|---:|:---:|');
  for (const r of rows) {
    const title = r.title.length > 28 ? `${r.title.slice(0, 27)}…` : r.title;
    console.log(
      `| ${title} | ${r.words} | ${r.uniqueCitedPapers} | ${r.fabricatedCitations} | ${r.sentenceCitationRatio} | ${r.claimsWithoutCitation} | ${r.objectivePivot ? '✓' : '✗'} |`
    );
  }

  console.log('\n## Aggregate (the baseline to beat)\n');
  const fab = rows.map((r) => r.fabricatedCitations);
  console.log(`- avg words: ${avg(rows.map((r) => r.words))}`);
  console.log(`- avg unique papers cited: ${avg(rows.map((r) => r.uniqueCitedPapers))}`);
  console.log(
    `- TOTAL fabricated citations: ${fab.reduce((a, b) => a + b, 0)}  (intros with ≥1: ${fab.filter((x) => x > 0).length}/${rows.length})  ← drive to 0`
  );
  console.log(
    `- avg cited/given source ratio: ${avg(rows.map((r) => r.citedSourceRatio))}  ← higher = retrieval actually used`
  );
  console.log(`- avg sentence-with-citation ratio: ${avg(rows.map((r) => r.sentenceCitationRatio))}`);
  console.log(`- avg claim sentences without citation: ${avg(rows.map((r) => r.claimsWithoutCitation))}  ← lower is better`);
  console.log(
    `- objective pivot present: ${rows.filter((r) => r.objectivePivot).length}/${rows.length}`
  );
  console.log('\nFull per-intro metrics (JSON):');
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
