#!/usr/bin/env node
/**
 * Batch reprocess papers via /api/papers/[id]/reprocess
 * @phase R176-1b
 *
 * Idempotent (worker dedup by paperId+version), an toàn re-run.
 * Throttle 2s giữa các call để tránh hammer publisher.
 *
 * Run:
 *   LABYRA_TOKEN="<firebase id token>" \
 *   node scripts/_batch-reprocess-papers.mjs --ids id1,id2,...
 *
 * Options:
 *   --ids <comma-separated>   Required. Paper IDs to reprocess
 *   --host <url>              Default https://labyra-app.vercel.app
 *   --origin <url>            Default same as host (for CSRF)
 *   --delay <ms>              Default 2000
 *   --dry                     Print without sending
 */

import process from 'node:process';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const ids = arg('ids');
const host = arg('host', 'https://labyra-app.vercel.app');
const origin = arg('origin', host);
const delay = parseInt(arg('delay', '2000'), 10);
const dry = arg('dry', false) === true;
const token = process.env.LABYRA_TOKEN;

if (!ids) {
  console.error('ERROR: --ids required (comma-separated paper IDs)');
  process.exit(1);
}
if (!token && !dry) {
  console.error('ERROR: LABYRA_TOKEN env required (Firebase ID token, fresh from browser)');
  console.error('Get: Firebase console snippet → copy accessToken');
  process.exit(1);
}

const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);

console.log(`\n=== Batch Reprocess (R176-1b) ===`);
console.log(`Papers: ${idList.length}`);
console.log(`Host:   ${host}`);
console.log(`Delay:  ${delay}ms`);
console.log(`Dry:    ${dry}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reprocess(paperId) {
  const url = `${host}/api/papers/${paperId}/reprocess`;
  if (dry) {
    console.log(`DRY: POST ${url}`);
    return { ok: true, dry: true };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }
  return { ok: res.ok, status: res.status, body: json };
}

let success = 0;
let fail = 0;
const failures = [];

for (let i = 0; i < idList.length; i++) {
  const id = idList[i];
  const shortId = id.slice(0, 16);
  process.stdout.write(`[${i + 1}/${idList.length}] ${shortId}... `);
  try {
    const r = await reprocess(id);
    if (r.ok) {
      success++;
      console.log(`✓ v${r.body?.version ?? '?'}`);
    } else {
      fail++;
      failures.push({ id, status: r.status, body: r.body });
      console.log(`✗ HTTP ${r.status}`);
    }
  } catch (e) {
    fail++;
    failures.push({ id, error: String(e) });
    console.log(`✗ ${e.message}`);
  }
  if (i < idList.length - 1) await sleep(delay);
}

console.log(`\n=== Result ===`);
console.log(`Success: ${success}`);
console.log(`Failed:  ${fail}`);

if (failures.length) {
  console.log(`\nFailures:`);
  failures.forEach((f) => console.log(`  - ${f.id.slice(0, 16)}: ${JSON.stringify(f)}`));
  process.exit(1);
}

console.log(`\nNext: wait ~30s, then check worker logs:`);
console.log(`  gcloud logging read 'resource.type=cloud_run_revision`);
console.log(`    AND resource.labels.service_name=spectra-worker`);
console.log(`    AND textPayload:"pipeline_complete"' --limit=10 --freshness=10m`);
console.log(`\nThen re-run audit:`);
console.log(`  node scripts/_audit-paper-metadata.mjs --tenant tenant-dev-001`);
