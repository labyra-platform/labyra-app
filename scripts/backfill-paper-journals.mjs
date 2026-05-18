#!/usr/bin/env node
/**
 * Backfill paper journal metadata via Crossref/OpenAlex DOI lookup (R179-2).
 *
 * Calls public APIs directly from Node (no worker queue needed for one-shot
 * backfill of <500 papers).
 *
 * Usage:
 *   node scripts/backfill-paper-journals.mjs --tenant tenant-dev-001
 *   node scripts/backfill-paper-journals.mjs --all-tenants --dry-run
 *
 * @phase R179-2
 * @r179-2-applied
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const POLITE_MAILTO = process.env.CROSSREF_POLITE_MAILTO ?? 'labyra-platform@github.io';
const UA = `Labyra-Backfill/1.0 (mailto:${POLITE_MAILTO})`;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const allTenants = args.includes('--all-tenants');
const tenantArg = args.indexOf('--tenant');
const tenantId = tenantArg >= 0 ? args[tenantArg + 1] : null;
const RATE_LIMIT_DELAY_MS = 200; // be polite to Crossref public pool

if (!allTenants && !tenantId) {
  console.error('Usage: --tenant <id> | --all-tenants  [--dry-run]');
  process.exit(1);
}

if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();
db.settings({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });

async function lookupCrossref(doi) {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`crossref_http_${res.status}`);
    const json = await res.json();
    const msg = json.message;
    if (!msg) return null;
    const ct = msg['container-title'];
    const sct = msg['short-container-title'];
    return {
      journal: Array.isArray(ct) && ct[0] ? String(ct[0]).trim() : '',
      journalShort: Array.isArray(sct) && sct[0] ? String(sct[0]).trim() : '',
      journalIssn: Array.isArray(msg.ISSN)
        ? msg.ISSN.filter((s) => typeof s === 'string').slice(0, 2)
        : [],
      source: 'crossref'
    };
  } catch (err) {
    console.warn(`  crossref err ${doi}: ${err.message}`);
    return null;
  }
}

async function lookupOpenAlex(doi) {
  try {
    const res = await fetch(`https://api.openalex.org/works/doi/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    const source = data?.primary_location?.source ?? {};
    const issn = [];
    if (typeof source.issn_l === 'string') issn.push(source.issn_l);
    if (Array.isArray(source.issn)) {
      for (const s of source.issn) {
        if (typeof s === 'string' && !issn.includes(s) && issn.length < 2) issn.push(s);
      }
    }
    return {
      journal: String(source.display_name ?? '').trim(),
      journalShort: String(source.abbreviated_title ?? '').trim(),
      journalIssn: issn,
      source: 'openalex'
    };
  } catch (err) {
    console.warn(`  openalex err ${doi}: ${err.message}`);
    return null;
  }
}

async function resolveJournal(doi) {
  const cr = await lookupCrossref(doi);
  if (cr && cr.journal) return cr;
  const oa = await lookupOpenAlex(doi);
  if (oa && oa.journal) return oa;
  return null;
}

async function getTenants() {
  if (tenantId) return [tenantId];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

async function backfillTenant(tid) {
  const snap = await db.collection(`tenants/${tid}/papers`).get();
  const candidates = snap.docs.filter((d) => {
    const data = d.data();
    return data.doi && !data.journal && data.status === 'indexed' && (!data.lifecycleStatus || data.lifecycleStatus === 'active');
  });
  console.log(`tenant=${tid} total=${snap.size} candidates=${candidates.length}`);

  let resolved = 0;
  let failed = 0;
  for (const d of candidates) {
    const data = d.data();
    const result = await resolveJournal(data.doi);
    if (!result) {
      failed++;
      console.log(`  ${d.id} ✗ no metadata for DOI ${data.doi}`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      continue;
    }
    resolved++;
    console.log(`  ${d.id} ✓ ${result.source} → ${result.journal}`);
    if (!dryRun) {
      await d.ref.update({
        journal: result.journal,
        journalShort: result.journalShort,
        journalIssn: result.journalIssn,
        journalSourceId: result.source,
        journalResolvedAt: Date.now()
      });
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }
  console.log(`  → resolved=${resolved} failed=${failed} dry=${dryRun}`);
}

(async () => {
  const tenants = await getTenants();
  for (const t of tenants) await backfillTenant(t);
  console.log('done.');
})().catch((err) => {
  console.error('backfill failed:', err);
  process.exit(1);
});
