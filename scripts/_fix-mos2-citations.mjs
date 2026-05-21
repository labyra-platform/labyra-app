/**
 * Fix hallucinated/mismatched citations in materialProfiles/MoS2.
 *
 * Problems found (R186 citation audit):
 *   1. electronicProps.citation: DOI 10.1038/nnano.2011.193 is FABRICATED
 *      (real "Single-layer MoS2 transistors" DOI is 10.1038/nnano.2010.279).
 *      Also that paper is about transistors/mobility, NOT the 1.29 eV band gap.
 *      → Replace with Mak et al. PRL 2010 (defines bulk-indirect → monolayer-direct).
 *   2. raman.citation + peaks: "Nano Letters 2012" 10.1021/nl201874w with title
 *      "Atomically thin MoS2" — wrong attribution for A1g/E2g layer-counting.
 *      → Replace with Lee et al. ACS Nano 2010 10.1021/nn1003937 (the origin paper).
 *   3. xrd.citation + peaks: "Electrochimica Acta 2007" 10.1016/j.electacta.2007.08.068
 *      — XRD reference should be the JCPDS/ICDD powder card, not an electrochem paper.
 *      → Remove the journal DOI; keep JCPDS 37-1492 in notes (no clickable DOI).
 *   4. pl.citation: 10.1103/PhysRevLett.105.136805 (Mak 2010) — ALREADY CORRECT, keep.
 *
 * All replacement DOIs verified via web search + CrossRef (2026-05-20).
 *
 * Usage:
 *   node --env-file=.env.local scripts/_fix-mos2-citations.mjs            # dry-run
 *   node --env-file=.env.local scripts/_fix-mos2-citations.mjs --apply    # write
 *
 * @phase R186-citation-fix
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

const creds = {
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();

// ─── Verified replacement citations ──────────────────────────────────────────
const MAK_PRL_2010 = {
  doi: '10.1103/PhysRevLett.105.136805',
  title: 'Atomically Thin MoS2: A New Direct-Gap Semiconductor',
  journal: 'Physical Review Letters',
  year: 2010,
  verified: true,
};

const LEE_ACSNANO_2010 = {
  doi: '10.1021/nn1003937',
  title: 'Anomalous Lattice Vibrations of Single- and Few-Layer MoS2',
  journal: 'ACS Nano',
  year: 2010,
  verified: true,
};

// ─── Optional CrossRef sanity check before writing ───────────────────────────
async function crossrefExists(doi) {
  try {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        headers: { 'User-Agent': 'labyra-citation-fix (mailto:dev@labyra.io)' },
        signal: AbortSignal.timeout(8000),
      },
    );
    return res.status; // 200 = exists
  } catch {
    return -1;
  }
}

const snap = await db.collection('materialProfiles').doc('MoS2').get();
if (!snap.exists) {
  console.error('MoS2 doc NOT FOUND');
  process.exit(1);
}
const data = snap.data();

// ─── Verify replacement DOIs resolve before applying ─────────────────────────
console.log('Verifying replacement DOIs against CrossRef...');
const makStatus = await crossrefExists(MAK_PRL_2010.doi);
const leeStatus = await crossrefExists(LEE_ACSNANO_2010.doi);
console.log(`  Mak PRL 2010 (${MAK_PRL_2010.doi}): HTTP ${makStatus}`);
console.log(`  Lee ACS Nano 2010 (${LEE_ACSNANO_2010.doi}): HTTP ${leeStatus}`);
if (makStatus !== 200 || leeStatus !== 200) {
  console.error('\nWARNING: a replacement DOI did not return 200. Aborting to avoid introducing another bad citation.');
  if (APPLY) process.exit(1);
}

// ─── Build corrected structure (deep clone + targeted edits) ─────────────────
const fixed = JSON.parse(JSON.stringify(data));

// 1. Band gap citation → Mak PRL 2010
console.log('\n[1] electronicProps.citation:');
console.log('    OLD:', data.electronicProps?.citation?.doi, `(${data.electronicProps?.citation?.journal} ${data.electronicProps?.citation?.year})`);
fixed.electronicProps.citation = { ...MAK_PRL_2010 };
console.log('    NEW:', MAK_PRL_2010.doi, `(${MAK_PRL_2010.journal} ${MAK_PRL_2010.year})`);

// 2. Raman citation (signature + each peak) → Lee ACS Nano 2010
console.log('\n[2] raman citations:');
console.log('    OLD sig:', data.spectralSignatures?.raman?.citation?.doi);
if (fixed.spectralSignatures?.raman) {
  fixed.spectralSignatures.raman.citation = { ...LEE_ACSNANO_2010 };
  if (Array.isArray(fixed.spectralSignatures.raman.peaks)) {
    fixed.spectralSignatures.raman.peaks = fixed.spectralSignatures.raman.peaks.map((p) =>
      p.citation ? { ...p, citation: { ...LEE_ACSNANO_2010 } } : p,
    );
  }
}
console.log('    NEW:', LEE_ACSNANO_2010.doi, `(${LEE_ACSNANO_2010.journal} ${LEE_ACSNANO_2010.year})`);

// 3. XRD: remove the bad journal DOI; keep JCPDS in notes (no clickable DOI)
console.log('\n[3] xrd citations:');
console.log('    OLD sig:', data.spectralSignatures?.xrd?.citation?.doi);
if (fixed.spectralSignatures?.xrd) {
  delete fixed.spectralSignatures.xrd.citation;
  if (Array.isArray(fixed.spectralSignatures.xrd.peaks)) {
    fixed.spectralSignatures.xrd.peaks = fixed.spectralSignatures.xrd.peaks.map((p) => {
      const { citation, ...rest } = p;
      return rest;
    });
  }
  // Ensure JCPDS reference stays visible in notes
  if (!/JCPDS|PDF#?\s*37-1492/i.test(fixed.spectralSignatures.xrd.notes ?? '')) {
    fixed.spectralSignatures.xrd.notes =
      (fixed.spectralSignatures.xrd.notes ?? '') +
      ' Reference: JCPDS/ICDD PDF 37-1492.';
  }
}
console.log('    NEW: (removed journal DOI; JCPDS 37-1492 kept in notes, no clickable link)');

// 4. PL — already correct, no change
console.log('\n[4] pl citation: kept (already correct Mak PRL 2010)');

// ─── Apply or dry-run ────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\n=== DRY RUN — no changes written. Re-run with --apply to commit. ===');
  process.exit(0);
}

fixed.updatedAt = new Date().toISOString();
fixed.version = (data.version ?? 1) + 1;
await db.collection('materialProfiles').doc('MoS2').set(fixed);
console.log('\n=== APPLIED. materialProfiles/MoS2 updated (version', fixed.version, ') ===');
process.exit(0);
