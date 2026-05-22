#!/usr/bin/env node
/**
 * round-192-10-verify-pinecone-groupid.mjs — TEAM-5 verify (read-only)
 *
 * Confirms the backfill landed: queries Pinecone for a sample of vectors and
 * checks metadata.groupId is present. Read-only — no writes, safe to re-run.
 *
 * Strategy: Pinecone serverless has no "list all ids" without a query vector,
 * so we query with a zero-ish vector + high topK and inspect returned metadata.
 * We also do a targeted check: query filtered by groupId='lab-shared' and count.
 *
 * Usage (labyra-app root; PINECONE_API_KEY in env):
 *   node scripts/round-192-10-verify-pinecone-groupid.mjs
 */
import { Pinecone } from '@pinecone-database/pinecone';

const TENANT_ID = process.env.MIGRATE_TENANT_ID ?? 'tenant-dev-001';
const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? 'labyra-papers';
const DIM = parseInt(process.env.PINECONE_DIM ?? '1024', 10); // Voyage-3-large = 1024

const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey || !apiKey.startsWith('pcsk_')) {
  console.error('[verify] PINECONE_API_KEY missing/malformed. Set in env.');
  process.exit(1);
}

const pc = new Pinecone({ apiKey });
const index = pc.index(INDEX_NAME);
const ns = index.namespace(TENANT_ID);

async function run() {
  console.log(`[verify] tenant=${TENANT_ID} index=${INDEX_NAME} dim=${DIM}`);

  // Stats: total vectors in namespace
  try {
    const stats = await index.describeIndexStats();
    const nsStats = stats.namespaces?.[TENANT_ID];
    console.log(`[verify] namespace vector count = ${nsStats?.recordCount ?? 'unknown'}`);
  } catch (e) {
    console.log('[verify] describeIndexStats failed (non-fatal):', e?.message ?? e);
  }

  // Sample query: random unit-ish vector, topK 20, inspect metadata.groupId
  const probe = Array.from({ length: DIM }, () => Math.random() - 0.5);
  const res = await ns.query({ vector: probe, topK: 20, includeMetadata: true });
  const matches = res.matches ?? [];
  let withGroup = 0;
  let withoutGroup = 0;
  const groupValues = new Set();
  for (const m of matches) {
    const g = m.metadata?.groupId;
    if (typeof g === 'string' && g.length > 0) {
      withGroup++;
      groupValues.add(g);
    } else {
      withoutGroup++;
      console.log(`  ⚠ vector ${m.id} has NO groupId`);
    }
  }
  console.log(`[verify] sampled=${matches.length} withGroupId=${withGroup} missing=${withoutGroup}`);
  console.log(`[verify] distinct groupId values in sample: ${[...groupValues].join(', ') || '(none)'}`);

  // Targeted: count via filtered query (groupId = lab-shared)
  const filtered = await ns.query({
    vector: probe,
    topK: 100,
    includeMetadata: false,
    filter: { groupId: 'lab-shared' }
  });
  console.log(`[verify] filtered query groupId='lab-shared' returned ${filtered.matches?.length ?? 0} (topK=100)`);

  if (withoutGroup === 0 && withGroup > 0) {
    console.log('\n[verify] ✅ sample looks good — vectors carry groupId. Safe to proceed to B4 filter.');
  } else if (withoutGroup > 0) {
    console.log('\n[verify] ⚠ some sampled vectors lack groupId — investigate before B4.');
    process.exit(1);
  } else {
    console.log('\n[verify] ⚠ no vectors sampled — namespace empty or query returned nothing.');
  }
}

run().catch((e) => {
  console.error('[verify] FATAL:', e);
  process.exit(1);
});
