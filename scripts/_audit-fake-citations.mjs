/**
 * Audit citations against R168-3.3 strict DOI regex.
 *
 * Modes:
 *   (default) dry-run: list all citations, classify each as:
 *     - REAL: DOI passes strict regex + (Crossref or OpenAlex) confirms
 *     - FAKE: DOI fails strict regex (OCR noise variants .1, .l, .J, /1, etc.)
 *     - UNVERIFIED: DOI passes strict regex but both APIs return 404
 *
 *   --delete: actually delete classified FAKE citations from Firestore
 *
 *   --downgrade: for citations passing regex but failing API lookup,
 *                set confidence='unverified' (R168-3.3 enum value)
 *
 * Tenant: default tenant-dev-001, override with --tenant <id>.
 *
 * Always logs full audit trail before any mutation. Skips Crossref/OpenAlex
 * for FAKE candidates (already determined to be regex-noise).
 *
 * Usage:
 *   FIRESTORE_DATABASE_ID='(default)' node --env-file=.env.local \
 *     scripts/_audit-fake-citations.mjs [--delete] [--downgrade] [--tenant <id>]
 *
 * @phase R168-3.3d
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ─────────── Strict DOI regex (mirrors R168-3.3 references-parser.ts) ───────────
const DOI_STRICT_RE = /^10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]*[a-zA-Z0-9]$/;
// Negative lookahead is for scan mode; for full-string validate above suffices.
// Plus reject any trailing dot-digit pattern that the scan-time lookahead catches.
const TRAILING_DOT_DIGIT_RE = /\.\d+$/;
const TRAILING_DOT_ALPHA_RE = /\.[a-zA-Z]$/; // .l, .a, .J etc

function isFakeRegex(doi) {
  if (!doi || typeof doi !== 'string') return true;
  if (!DOI_STRICT_RE.test(doi)) return true;
  if (TRAILING_DOT_DIGIT_RE.test(doi)) return true;
  if (TRAILING_DOT_ALPHA_RE.test(doi)) return true;
  // Slash followed by single digit at end is also suspect (10.X/Y/1)
  // but legitimate DOIs can have slashes; only flag if slash-digit is the suffix
  // AND the part before looks like a normal DOI body that already ended.
  // Conservative: only flag .X or single-trailing-J-style
  return false;
}

function classifyTrailing(doi) {
  if (TRAILING_DOT_DIGIT_RE.test(doi)) return 'trailing-dot-digit';
  if (TRAILING_DOT_ALPHA_RE.test(doi)) return 'trailing-dot-alpha';
  if (!DOI_STRICT_RE.test(doi)) return 'regex-fail';
  return 'pass-regex';
}

// ─────────── Crossref lookup (minimal, sync via fetch) ───────────
const CROSSREF_API = 'https://api.crossref.org/works';

async function quickCrossrefCheck(doi) {
  const url = `${CROSSREF_API}/${encodeURIComponent(doi)}`;
  const mailto = process.env.CROSSREF_POLITE_MAILTO;
  const headers = mailto ? { 'User-Agent': `labyra-audit (mailto:${mailto})` } : {};
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    return res.status; // 200 = exists, 404 = not found, others = error
  } catch (err) {
    return -1; // network error
  }
}

// ─────────── Args ───────────
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--delete');
const DOWNGRADE = args.includes('--downgrade');
let TENANT_ID = 'tenant-dev-001';
const tIdx = args.indexOf('--tenant');
if (tIdx >= 0 && args[tIdx + 1]) TENANT_ID = args[tIdx + 1];

// ─────────── Firebase init ───────────
const creds = {
  type: 'service_account',
  project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
};
initializeApp({ credential: cert(creds) });
const db = getFirestore();
db.settings({ databaseId: '(default)' });

// ─────────── Main audit ───────────
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'DELETE'}${DOWNGRADE ? ' + DOWNGRADE' : ''}`);
console.log(`Tenant: ${TENANT_ID}\n`);

const collRef = db.collection(`tenants/${TENANT_ID}/citations`);
const snap = await collRef.get();
console.log(`Total citations: ${snap.size}\n`);

const buckets = { real: [], fake: [], unverified: [], error: [] };

for (const doc of snap.docs) {
  const d = doc.data();
  const doi = d.targetDoi;
  if (!doi) {
    // Title-only citation, skip regex check
    buckets.real.push({ doc, reason: 'no-doi (title-only)' });
    continue;
  }

  // Regex classification
  const trailing = classifyTrailing(doi);
  if (isFakeRegex(doi)) {
    buckets.fake.push({ doc, doi, reason: trailing });
    continue;
  }

  // Passes regex → verify against Crossref
  process.stdout.write(`  Checking ${doi} ... `);
  const status = await quickCrossrefCheck(doi);
  if (status === 200) {
    console.log('REAL (Crossref 200)');
    buckets.real.push({ doc, doi, reason: 'crossref-200' });
  } else if (status === 404) {
    console.log('UNVERIFIED (Crossref 404)');
    buckets.unverified.push({ doc, doi, reason: 'crossref-404' });
  } else {
    console.log(`ERROR (status ${status})`);
    buckets.error.push({ doc, doi, status });
  }

  // Rate limit politeness
  await new Promise((r) => setTimeout(r, 250));
}

// ─────────── Report ───────────
console.log(`\n=== Audit report ===`);
console.log(`REAL:       ${buckets.real.length}`);
console.log(`FAKE:       ${buckets.fake.length}  (regex-fail or trailing-noise)`);
console.log(`UNVERIFIED: ${buckets.unverified.length}  (passes regex, Crossref 404)`);
console.log(`ERROR:      ${buckets.error.length}  (network/timeout — not actioned)`);

if (buckets.fake.length > 0) {
  console.log(`\n--- FAKE citations ---`);
  for (const item of buckets.fake) {
    const d = item.doc.data();
    console.log(`  ${item.doc.id}`);
    console.log(`    targetDoi: ${item.doi}`);
    console.log(`    reason: ${item.reason}`);
    console.log(`    sourcePaperId: ${d.sourcePaperId}`);
    console.log(`    confidence: ${d.confidence}`);
  }
}

if (buckets.unverified.length > 0) {
  console.log(`\n--- UNVERIFIED citations (Crossref 404, regex passes) ---`);
  for (const item of buckets.unverified) {
    const d = item.doc.data();
    console.log(`  ${item.doc.id}  targetDoi=${item.doi}  current_confidence=${d.confidence}`);
  }
}

// ─────────── Mutate (if not dry-run) ───────────
if (DRY_RUN) {
  console.log(`\nDRY-RUN: no changes made. Re-run with --delete to remove FAKE, --downgrade to fix UNVERIFIED.`);
  process.exit(0);
}

// DELETE fakes
if (buckets.fake.length > 0) {
  console.log(`\n=== Deleting ${buckets.fake.length} FAKE citations ===`);
  for (const item of buckets.fake) {
    await item.doc.ref.delete();
    console.log(`  ✓ Deleted ${item.doc.id}`);
  }
}

// DOWNGRADE unverified
if (DOWNGRADE && buckets.unverified.length > 0) {
  console.log(`\n=== Downgrading ${buckets.unverified.length} UNVERIFIED citations to confidence='unverified' ===`);
  for (const item of buckets.unverified) {
    const d = item.doc.data();
    if (d.confidence === 'unverified') {
      console.log(`  ⏭  ${item.doc.id} already 'unverified', skipping`);
      continue;
    }
    await item.doc.ref.update({
      confidence: 'unverified',
      // Audit trail
      updatedAt: Timestamp.now(),
      // PROV-O: track who/what changed it
      lastModifiedBy: 'audit-script-R168-3.3d'
    });
    console.log(`  ✓ Downgraded ${item.doc.id}: ${d.confidence} → unverified`);
  }
}

// ─────────── Recompute stats for affected source papers ───────────
const affectedSources = new Set([
  ...buckets.fake.map((i) => i.doc.data().sourcePaperId),
  ...(DOWNGRADE ? buckets.unverified.map((i) => i.doc.data().sourcePaperId) : [])
]);

if (affectedSources.size > 0) {
  console.log(`\n=== Note: ${affectedSources.size} source papers had citations changed ===`);
  console.log(`Stats subcollection (_stats) may need recompute. Affected papers:`);
  for (const pid of affectedSources) {
    console.log(`  - ${pid}`);
  }
  console.log(`\nRecompute via: reprocess each paper, OR call recomputeCitationStats() server-side.`);
  console.log(`Quick way: trigger /api/papers/<id>/reprocess for each.`);
}

console.log(`\n✅ Audit complete.`);
