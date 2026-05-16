#!/usr/bin/env node
/**
 * Founder CLI — query cost data from tenants/{tid}/_costs/{date}.
 *
 * Usage:
 *   node --env-file=.env.local scripts/cost-query.mjs --tenant <id> [options]
 *   node --env-file=.env.local scripts/cost-query.mjs --all-tenants [options]
 *
 * Options:
 *   --today                  Today's data only
 *   --month YYYY-MM          Specific month (default: current)
 *   --csv                    CSV output to stdout
 *   --tier-breakdown         Show per-tier rows
 *   --feature-breakdown      Show per-feature rows
 *   --capability-breakdown   Show per-capability rows (latency + tokens)
 *
 * @phase R171-2
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadAdminCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin env vars');
  }
  return { projectId, clientEmail, privateKey };
}

function parseArgs(argv) {
  const args = {
    tenant: null,
    allTenants: false,
    today: false,
    month: null,
    csv: false,
    tierBreakdown: false,
    featureBreakdown: false,
    capabilityBreakdown: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--all-tenants') args.allTenants = true;
    else if (a === '--today') args.today = true;
    else if (a === '--month') args.month = argv[++i];
    else if (a === '--csv') args.csv = true;
    else if (a === '--tier-breakdown') args.tierBreakdown = true;
    else if (a === '--feature-breakdown') args.featureBreakdown = true;
    else if (a === '--capability-breakdown') args.capabilityBreakdown = true;
  }
  return args;
}

function todayYmd() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function fetchTenantCosts(db, tenantId, args) {
  if (args.today) {
    const snap = await db.doc(`tenants/${tenantId}/_costs/${todayYmd()}`).get();
    return snap.exists ? [snap.data()] : [];
  }

  const ym = args.month || currentYearMonth();
  const snap = await db
    .collection(`tenants/${tenantId}/_costs`)
    .where('date', '>=', `${ym}-01`)
    .where('date', '<=', `${ym}-31`)
    .orderBy('date', 'asc')
    .get();

  return snap.docs.map((d) => d.data());
}

async function fetchAllTenants(db) {
  const snap = await db.collection('tenants').get();
  return snap.docs.map((d) => d.id);
}

function formatCurrency(usd) {
  return `$${(usd ?? 0).toFixed(4)}`;
}

function formatNumber(n) {
  return (n ?? 0).toLocaleString('en-US');
}

function renderTable(rows, columns) {
  if (rows.length === 0) {
    console.log('(no data)');
    return;
  }

  const widths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(r[col.key] ?? '').length))
  );

  const sep = '─'.repeat(widths.reduce((a, b) => a + b + 3, 0));
  console.log(sep);
  console.log(
    columns.map((col, i) => col.label.padEnd(widths[i])).join(' │ ')
  );
  console.log(sep);
  for (const row of rows) {
    console.log(
      columns.map((col, i) => String(row[col.key] ?? '').padEnd(widths[i])).join(' │ ')
    );
  }
  console.log(sep);
}

function renderCsv(rows, columns) {
  console.log(columns.map((c) => c.label).join(','));
  for (const row of rows) {
    console.log(columns.map((c) => row[c.key] ?? '').join(','));
  }
}

function printSummary(args, docs, tenantId) {
  if (docs.length === 0) {
    console.log(`(no _costs/* docs for ${tenantId})`);
    return;
  }

  const total = docs.reduce((sum, d) => sum + (d.totalCost ?? 0), 0);
  const queries = docs.reduce(
    (sum, d) => sum + Object.values(d.byTier ?? {}).reduce((t, v) => t + (v.queries ?? 0), 0),
    0
  );
  const avgPerQuery = queries > 0 ? total / queries : 0;

  const rows = [
    {
      tenant: tenantId,
      days: docs.length,
      total: formatCurrency(total),
      queries: formatNumber(queries),
      avgPerQuery: formatCurrency(avgPerQuery)
    }
  ];

  const cols = [
    { key: 'tenant', label: 'Tenant' },
    { key: 'days', label: 'Days' },
    { key: 'total', label: 'Total USD' },
    { key: 'queries', label: 'Queries' },
    { key: 'avgPerQuery', label: 'Avg/Query' }
  ];

  if (args.csv) renderCsv(rows, cols);
  else renderTable(rows, cols);
}

function printTierBreakdown(docs, tenantId, csv) {
  const agg = {};
  for (const d of docs) {
    for (const [tier, stats] of Object.entries(d.byTier ?? {})) {
      agg[tier] = agg[tier] || { queries: 0, cost: 0 };
      agg[tier].queries += stats.queries ?? 0;
      agg[tier].cost += stats.cost ?? 0;
    }
  }
  const rows = Object.entries(agg)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([tier, s]) => ({
      tier: `T${tier}`,
      queries: formatNumber(s.queries),
      cost: formatCurrency(s.cost),
      avgPerQuery: formatCurrency(s.queries > 0 ? s.cost / s.queries : 0)
    }));

  console.log(`\n[Tier breakdown — ${tenantId}]`);
  const cols = [
    { key: 'tier', label: 'Tier' },
    { key: 'queries', label: 'Queries' },
    { key: 'cost', label: 'Cost USD' },
    { key: 'avgPerQuery', label: 'Avg/Query' }
  ];
  if (csv) renderCsv(rows, cols);
  else renderTable(rows, cols);
}

function printFeatureBreakdown(docs, tenantId, csv) {
  const agg = {};
  for (const d of docs) {
    for (const [feature, stats] of Object.entries(d.byFeature ?? {})) {
      agg[feature] = agg[feature] || { queries: 0, cost: 0, unverifiedNumbers: 0, unsourcedClaims: 0 };
      agg[feature].queries += stats.queries ?? 0;
      agg[feature].cost += stats.cost ?? 0;
      agg[feature].unverifiedNumbers += stats.unverifiedNumbersTotal ?? 0;
      agg[feature].unsourcedClaims += stats.unsourcedClaimsTotal ?? 0;
    }
  }
  const rows = Object.entries(agg)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([feature, s]) => ({
      feature,
      queries: formatNumber(s.queries),
      cost: formatCurrency(s.cost),
      avgPerQuery: formatCurrency(s.queries > 0 ? s.cost / s.queries : 0),
      unverifiedNums: formatNumber(s.unverifiedNumbers),
      unsourcedClaims: formatNumber(s.unsourcedClaims)
    }));

  console.log(`\n[Feature breakdown — ${tenantId}]`);
  const cols = [
    { key: 'feature', label: 'Feature' },
    { key: 'queries', label: 'Queries' },
    { key: 'cost', label: 'Cost USD' },
    { key: 'avgPerQuery', label: 'Avg/Query' },
    { key: 'unverifiedNums', label: 'Unverified #' },
    { key: 'unsourcedClaims', label: 'Unsourced Cl' }
  ];
  if (csv) renderCsv(rows, cols);
  else renderTable(rows, cols);
}

function printCapabilityBreakdown(docs, tenantId, csv) {
  const agg = {};
  for (const d of docs) {
    for (const [cap, stats] of Object.entries(d.byCapability ?? {})) {
      agg[cap] = agg[cap] || {
        queries: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        latencyMsTotal: 0
      };
      agg[cap].queries += stats.queries ?? 0;
      agg[cap].cost += stats.cost ?? 0;
      agg[cap].inputTokens += stats.inputTokens ?? 0;
      agg[cap].outputTokens += stats.outputTokens ?? 0;
      agg[cap].latencyMsTotal += stats.latencyMsTotal ?? 0;
    }
  }
  const rows = Object.entries(agg)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([cap, s]) => ({
      capability: cap,
      queries: formatNumber(s.queries),
      cost: formatCurrency(s.cost),
      inputK: formatNumber(Math.round(s.inputTokens / 1000)) + 'K',
      outputK: formatNumber(Math.round(s.outputTokens / 1000)) + 'K',
      avgLatencyMs: s.queries > 0 ? Math.round(s.latencyMsTotal / s.queries) : 0
    }));

  console.log(`\n[Capability breakdown — ${tenantId}]`);
  const cols = [
    { key: 'capability', label: 'Capability' },
    { key: 'queries', label: 'Queries' },
    { key: 'cost', label: 'Cost USD' },
    { key: 'inputK', label: 'Input tok' },
    { key: 'outputK', label: 'Output tok' },
    { key: 'avgLatencyMs', label: 'Avg ms' }
  ];
  if (csv) renderCsv(rows, cols);
  else renderTable(rows, cols);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.tenant && !args.allTenants) {
    console.error('Usage: node --env-file=.env.local scripts/cost-query.mjs --tenant <id> [options]');
    console.error('       node --env-file=.env.local scripts/cost-query.mjs --all-tenants [options]');
    console.error('');
    console.error('Options:');
    console.error('  --today                  Today only');
    console.error('  --month YYYY-MM          Specific month (default: current)');
    console.error('  --csv                    CSV output');
    console.error('  --tier-breakdown         Per-tier rows');
    console.error('  --feature-breakdown      Per-feature rows');
    console.error('  --capability-breakdown   Per-capability + latency + tokens');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(loadAdminCredentials()) });
  }
  const db = getFirestore();

  const tenants = args.allTenants ? await fetchAllTenants(db) : [args.tenant];

  for (const tenantId of tenants) {
    const docs = await fetchTenantCosts(db, tenantId, args);

    if (!args.csv) {
      console.log(`\n=== ${tenantId} ${args.today ? `(${todayYmd()})` : `(${args.month || currentYearMonth()})`} ===`);
    }

    printSummary(args, docs, tenantId);

    if (args.tierBreakdown) printTierBreakdown(docs, tenantId, args.csv);
    if (args.featureBreakdown) printFeatureBreakdown(docs, tenantId, args.csv);
    if (args.capabilityBreakdown) printCapabilityBreakdown(docs, tenantId, args.csv);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
