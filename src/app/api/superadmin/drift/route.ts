/**
 * GET /api/superadmin/drift — drift reports across tenants.
 *
 * Query params:
 *   ?range=N  (last N days, default 7)
 *
 * @phase R172-4
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { requireSuperadmin } from '@/lib/auth/superadmin-guard';

function utcYmd(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireSuperadmin(request);
  if (!guard.allowed) return guard.response!;

  const url = new URL(request.url);
  const rangeDays = Math.min(parseInt(url.searchParams.get('range') ?? '7', 10) || 7, 30);

  const db = getAdminFirestoreService();
  const tenantsSnap = await db.collection('tenants').get();

  const startDate = utcYmd(rangeDays);
  const endDate = utcYmd(0);

  const reports: Array<Record<string, unknown>> = [];
  const alerts: Array<Record<string, unknown>> = [];

  for (const tenantDoc of tenantsSnap.docs) {
    const tenantId = tenantDoc.id;
    const driftSnap = await db
      .collection(`tenants/${tenantId}/_drift`)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    for (const doc of driftSnap.docs) {
      const data = doc.data();
      reports.push({ tenantId, ...data });
      if (data.alertTriggered) {
        alerts.push({ tenantId, ...data });
      }
    }
  }

  return NextResponse.json({
    range: { startDate, endDate, days: rangeDays },
    totalReports: reports.length,
    totalAlerts: alerts.length,
    reports,
    alerts
  });
}
