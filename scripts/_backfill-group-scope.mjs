#!/usr/bin/env node
/**
 * Backfill group scope: claim every 'lab-shared' (or missing-groupId) paper
 * into the CALLER's group, via POST /api/papers/[id]/share {target:'group'}.
 * @phase R489
 *
 * Goes through the deployed API on purpose — same verified code path as the
 * UI kebab (Firestore groupId + Pinecone chunk metadata re-stamp + owner/admin
 * permission checks). No duplicated logic, no admin credentials.
 *
 * DRY-RUN BY DEFAULT. Nothing is written without --apply.
 *
 * Run (easiest — script signs in itself, reads NEXT_PUBLIC_FIREBASE_API_KEY
 * from .env.local):
 *   LABYRA_EMAIL="you@x.com" LABYRA_PASSWORD="..." \
 *   node scripts/_backfill-group-scope.mjs                 # dry-run: list targets
 *   ... --apply                                            # execute
 *
 * Or with a pre-minted token (e.g. Google-SSO accounts):
 *   LABYRA_TOKEN="<firebase id token>" node scripts/_backfill-group-scope.mjs
 *
 * Options:
 *   --host <url>       Default https://labyra-app.vercel.app
 *   --origin <url>     Default same as host (for CSRF)
 *   --uploader <uid>   Only papers with uploadedBy === uid
 *   --delay <ms>       Default 2500 (share rate limit is 30/min per tenant)
 *   --apply            Actually share; otherwise dry-run
 *
 * Requirements: the token's account must HAVE a groupId claim (assign group,
 * then re-login before grabbing the token) — otherwise the API returns 400
 * no_group. The account must be admin (or the uploader of every paper).
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const host = arg('host', 'https://labyra-app.vercel.app');
const origin = arg('origin', host);
const uploader = arg('uploader');
const delay = parseInt(arg('delay', '2500'), 10);
const apply = process.argv.includes('--apply');

/** Sign in via Identity Toolkit REST — mints a fresh ID token WITH current custom claims. */
async function mintToken(email, password) {
  let apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    try {
      const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
      apiKey = env.match(/^NEXT_PUBLIC_FIREBASE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
    } catch {
      /* no .env.local */
    }
  }
  if (!apiKey) {
    console.error('ERROR: NEXT_PUBLIC_FIREBASE_API_KEY not found (env or .env.local).');
    process.exit(1);
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const d = await res.json();
  if (!res.ok || !d.idToken) {
    console.error(`ERROR: sign-in failed — ${d.error?.message ?? res.status}. Google-SSO account? Use LABYRA_TOKEN instead.`);
    process.exit(1);
  }
  return d.idToken;
}

let token = process.env.LABYRA_TOKEN;
if (!token && process.env.LABYRA_EMAIL && process.env.LABYRA_PASSWORD) {
  token = await mintToken(process.env.LABYRA_EMAIL, process.env.LABYRA_PASSWORD);
  console.log('Signed in — fresh ID token minted (60 min).');
}
if (!token) {
  console.error('ERROR: set LABYRA_EMAIL+LABYRA_PASSWORD (script signs in itself) or LABYRA_TOKEN.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Origin: origin,
  'Content-Type': 'application/json'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. List all papers the caller can see (admin → everything in tenant).
  const listRes = await fetch(`${host}/api/papers?limit=200&includeDeprecated=true`, { headers });
  if (!listRes.ok) {
    console.error(`ERROR: GET /api/papers → HTTP ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const { items } = await listRes.json();
  if (items.length === 200) {
    console.warn('NOTE: list capped at 200 — re-run this script after --apply to catch any remainder.');
  }

  let targets = items.filter((p) => !p.groupId || p.groupId === 'lab-shared');
  if (uploader) targets = targets.filter((p) => p.uploadedBy === uploader);

  if (targets.length === 0) {
    console.log('Nothing to backfill — no lab-shared / missing-groupId papers matched.');
    return;
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${targets.length} paper(s) → caller's group\n`);
  for (const p of targets) {
    const title = (p.title ?? '(untitled)').slice(0, 70);
    console.log(`  ${p.id}  [${p.groupId ?? 'MISSING'}]  ${title}`);
  }
  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to execute.');
    return;
  }

  console.log('');
  let ok = 0;
  let failed = 0;
  for (const p of targets) {
    try {
      const res = await fetch(`${host}/api/papers/${p.id}/share`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ target: 'group' })
      });
      if (res.status === 400) {
        const body = await res.text();
        if (body.includes('no_group')) {
          console.error('FATAL: caller has no groupId claim. Assign a group, re-login, grab a fresh token.');
          process.exit(1);
        }
        throw new Error(`HTTP 400 ${body}`);
      }
      if (res.status === 429) {
        console.warn(`  RATE LIMITED at ${p.id} — waiting 65s, then retrying once...`);
        await sleep(65_000);
        const retry = await fetch(`${host}/api/papers/${p.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target: 'group' })
        });
        if (!retry.ok) throw new Error(`retry HTTP ${retry.status}`);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      ok += 1;
      console.log(`  OK      ${p.id}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAILED  ${p.id}  ${e instanceof Error ? e.message : e}`);
    }
    await sleep(delay);
  }
  console.log(`\nDone: ${ok} shared, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
