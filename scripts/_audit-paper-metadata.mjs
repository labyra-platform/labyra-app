#!/usr/bin/env node
/**
 * Audit Paper Metadata Completeness
 * @phase R176-1-audit
 *
 * Đếm papers theo: có DOI, có authors, có year, complete/partial/missing.
 * Output: stats per tenant + sample của papers thiếu metadata.
 *
 * Run:
 *   FIRESTORE_DATABASE_ID="(default)" \
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   node scripts/_audit-paper-metadata.mjs
 *
 * Optional: --tenant <tid> để filter, --sample <N> số papers thiếu hiển thị
 */

import admin from 'firebase-admin';
import process from 'node:process';

const args = process.argv.slice(2);
const tenantFilter = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : null;
const sampleSize = args.includes('--sample')
  ? parseInt(args[args.indexOf('--sample') + 1] ?? '5', 10)
  : 5;

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'labyra-app-dev' });
}

const db = admin.firestore();

function hasNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0 && v.some((x) => hasNonEmptyString(x));
}

function isValidYear(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1900 && v <= 2100) return true;
  if (typeof v === 'string' && /^\d{4}$/.test(v.trim())) {
    const n = parseInt(v, 10);
    return n >= 1900 && n <= 2100;
  }
  return false;
}

async function listTenants() {
  if (tenantFilter) return [tenantFilter];
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

async function auditTenant(tid) {
  const papersSnap = await db.collection(`tenants/${tid}/papers`).get();
  const stats = {
    total: 0,
    hasDoi: 0,
    hasAuthors: 0,
    hasYear: 0,
    hasTitle: 0,
    complete: 0, // authors + year + title
    partialMissingAuthors: 0,
    partialMissingYear: 0,
    partialMissingTitle: 0,
    missingAll: 0,
    yearZeroBug: 0, // year === 0 hoặc "0" — R167 handoff §3.4
    doiButIncomplete: 0,
    noDoiAndIncomplete: 0,
  };
  const samples = {
    doiButIncomplete: [],
    noDoiAndIncomplete: [],
    yearZeroBug: [],
  };

  for (const doc of papersSnap.docs) {
    stats.total++;
    const data = doc.data();
    const doi = data.doi ?? data.metadata?.doi;
    const authors = data.authors ?? data.metadata?.authors;
    const year = data.year ?? data.metadata?.year;
    const title = data.title ?? data.metadata?.title;

    const okDoi = hasNonEmptyString(doi);
    const okAuthors = hasNonEmptyArray(authors);
    const okYear = isValidYear(year);
    const okTitle = hasNonEmptyString(title);

    if (okDoi) stats.hasDoi++;
    if (okAuthors) stats.hasAuthors++;
    if (okYear) stats.hasYear++;
    if (okTitle) stats.hasTitle++;

    if (year === 0 || year === '0') {
      stats.yearZeroBug++;
      if (samples.yearZeroBug.length < sampleSize) {
        samples.yearZeroBug.push({ id: doc.id, doi, title, authors, year });
      }
    }

    const complete = okAuthors && okYear && okTitle;
    if (complete) {
      stats.complete++;
    } else {
      if (!okAuthors) stats.partialMissingAuthors++;
      if (!okYear) stats.partialMissingYear++;
      if (!okTitle) stats.partialMissingTitle++;
      if (!okAuthors && !okYear && !okTitle) stats.missingAll++;

      if (okDoi) {
        stats.doiButIncomplete++;
        if (samples.doiButIncomplete.length < sampleSize) {
          samples.doiButIncomplete.push({
            id: doc.id,
            doi,
            title: title || null,
            authors: authors || null,
            year: year ?? null,
          });
        }
      } else {
        stats.noDoiAndIncomplete++;
        if (samples.noDoiAndIncomplete.length < sampleSize) {
          samples.noDoiAndIncomplete.push({
            id: doc.id,
            title: title || null,
            authors: authors || null,
            year: year ?? null,
          });
        }
      }
    }
  }

  return { stats, samples };
}

async function main() {
  const tenants = await listTenants();
  console.log(`\n=== Paper Metadata Audit (R176-1) ===`);
  console.log(`Tenants scanned: ${tenants.length}\n`);

  let grandTotal = 0;
  let grandComplete = 0;
  let grandDoiBacked = 0;
  let grandNoDoi = 0;

  for (const tid of tenants) {
    const { stats, samples } = await auditTenant(tid);
    if (stats.total === 0) continue;

    console.log(`--- Tenant: ${tid} ---`);
    console.log(`  Total papers:        ${stats.total}`);
    console.log(`  Has DOI:             ${stats.hasDoi} (${pct(stats.hasDoi, stats.total)})`);
    console.log(`  Has authors:         ${stats.hasAuthors} (${pct(stats.hasAuthors, stats.total)})`);
    console.log(`  Has year valid:      ${stats.hasYear} (${pct(stats.hasYear, stats.total)})`);
    console.log(`  Has title:           ${stats.hasTitle} (${pct(stats.hasTitle, stats.total)})`);
    console.log(`  Complete metadata:   ${stats.complete} (${pct(stats.complete, stats.total)})`);
    console.log(`  --- Gaps ---`);
    console.log(`  Year=0 bug:          ${stats.yearZeroBug}`);
    console.log(`  DOI but incomplete:  ${stats.doiButIncomplete}  (Crossref backfill path)`);
    console.log(`  No DOI, incomplete:  ${stats.noDoiAndIncomplete}  (LLM extract path)`);

    if (samples.yearZeroBug.length) {
      console.log(`\n  Sample year=0 papers:`);
      samples.yearZeroBug.forEach((p) =>
        console.log(`    - ${p.id} doi=${p.doi || 'none'} year=${JSON.stringify(p.year)}`),
      );
    }
    if (samples.doiButIncomplete.length) {
      console.log(`\n  Sample DOI-but-incomplete:`);
      samples.doiButIncomplete.forEach((p) =>
        console.log(
          `    - ${p.id} doi=${p.doi} authors=${p.authors ? 'OK' : 'MISS'} year=${p.year ?? 'MISS'}`,
        ),
      );
    }
    if (samples.noDoiAndIncomplete.length) {
      console.log(`\n  Sample no-DOI-incomplete:`);
      samples.noDoiAndIncomplete.forEach((p) =>
        console.log(
          `    - ${p.id} title="${(p.title || '').slice(0, 60)}" authors=${p.authors ? 'OK' : 'MISS'} year=${p.year ?? 'MISS'}`,
        ),
      );
    }
    console.log('');

    grandTotal += stats.total;
    grandComplete += stats.complete;
    grandDoiBacked += stats.doiButIncomplete;
    grandNoDoi += stats.noDoiAndIncomplete;
  }

  console.log(`=== Grand totals ===`);
  console.log(`  Total papers:               ${grandTotal}`);
  console.log(`  Complete:                   ${grandComplete} (${pct(grandComplete, grandTotal)})`);
  console.log(`  Need Crossref backfill:     ${grandDoiBacked}`);
  console.log(`  Need LLM-extract backfill:  ${grandNoDoi}`);
  console.log(`  Backfill total candidates:  ${grandDoiBacked + grandNoDoi}\n`);
}

function pct(part, total) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Audit failed:', e);
    process.exit(1);
  });
