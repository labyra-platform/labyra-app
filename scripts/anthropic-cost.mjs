const KEY = process.env.ANTHROPIC_ADMIN_KEY;
if (!KEY || !KEY.startsWith('sk-ant-admin')) {
  console.error('Set ANTHROPIC_ADMIN_KEY to an Admin key (sk-ant-admin...).');
  console.error('Create: console.anthropic.com -> Settings -> API keys -> Admin keys (org admin only).');
  process.exit(1);
}
const days = Number(process.argv[2] || 30);
const startISO = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z';
const byModel = {}, byDesc = {};
let total = 0, currency = 'USD', page = null;
do {
  const u = new URL('https://api.anthropic.com/v1/organizations/cost_report');
  u.searchParams.set('starting_at', startISO);
  u.searchParams.append('group_by[]', 'description');
  u.searchParams.set('limit', '31');
  if (page) u.searchParams.set('page', page);
  const r = await fetch(u, { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': KEY } });
  if (!r.ok) { console.error('HTTP', r.status, '-', (await r.text()).slice(0, 300)); process.exit(1); }
  const j = await r.json();
  for (const bucket of j.data || []) for (const res of bucket.results || []) {
    const amt = parseFloat(res.amount || '0'); total += amt; currency = res.currency || currency;
    const m = res.model || res.description || 'other'; byModel[m] = (byModel[m] || 0) + amt;
    byDesc[res.description || '?'] = (byDesc[res.description || '?'] || 0) + amt;
  }
  page = j.has_more ? j.next_page : null;
} while (page);
const fmt = (n) => currency + ' ' + n.toFixed(4);
const sd = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
console.log('\n====== ANTHROPIC REAL COST (last ' + days + 'd) ======');
console.log('  from ' + startISO + '\n  By model');
for (const [m, v] of sd(byModel)) console.log('    ' + fmt(v).padStart(16) + '  ' + m);
console.log('  -----------------------------\n    ' + fmt(total).padStart(16) + '  TOTAL');
console.log('\n  By line item (top 12)');
for (const [d, v] of sd(byDesc).slice(0, 12)) console.log('    ' + fmt(v).padStart(16) + '  ' + d);
console.log('');
process.exit(0);
