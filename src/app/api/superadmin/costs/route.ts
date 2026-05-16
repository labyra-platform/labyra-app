/**
 * GET /api/superadmin/costs — aggregate cost data across all tenants.
 *
 * Query params:
 *   ?date=YYYY-MM-DD  (default: today UTC)
 *   ?range=N          (last N days, default 30)
 *
 * @phase R172-2
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { requireSuperadmin } from '@/lib/auth/superadmin-guard';

interface DailyTotal {
  date: string;
  tenantId: string;
  totalCost: number;
  byTier: Record<string, { queries: number; cost: number }>;
  byFeature: Record<string, { queries: number; cost: number }>;
  byCapability: Record<string, { cost: number; queries?: number; latencyMsTotal?: number }>;
}

function utcYmd(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireSuperadmin(request);
  if (!guard.allowed) return guard.response!;

  const url = new URL(request.url);
  const rangeParam = url.searchParams.get('range') ?? '30';
  const rangeDays = Math.min(parseInt(rangeParam, 10) || 30, 90);

  const db = getAdminFirestoreService();
  const tenantsSnap = await db.collection('tenants').get();

  const startDate = utcYmd(rangeDays);
  const endDate = utcYmd(0);

  const allRows: DailyTotal[] = [];
  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const costsSnap = await db
      .collection(`tenants/${tenantId}/_costs`)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    for (const doc of costsSnap.docs) {
      const d = doc.data();
      allRows.push({
        date: d.date,
        tenantId,
        totalCost: d.totalCost ?? 0,
        byTier: d.byTier ?? {},
        byFeature: d.byFeature ?? {},
        byCapability: d.byCapability ?? {}
      });
    }
  }

  // Aggregate summary
  const totalCost = allRows.reduce((s, r) => s + r.totalCost, 0);
  const totalQueries = allRows.reduce(
    (s, r) => s + Object.values(r.byTier).reduce((tot, v) => tot + v.queries, 0),
    0
  );

  return NextResponse.json({
    range: { startDate, endDate, days: rangeDays },
    summary: {
      totalCost,
      totalQueries,
      avgCostPerQuery: totalQueries > 0 ? totalCost / totalQueries : 0,
      tenantCount: tenantsSnap.size,
      dayCount: new Set(allRows.map((r) => r.date)).size
    },
    rows: allRows
  });
}
