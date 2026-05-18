/**
 * Cost aggregator helpers — read tenant cost from _costs/{date}.
 *
 * Used by Cost Guard v2 (pre-call quota check) + future CLI admin script.
 *
 * @phase R170-5
 */
import 'server-only';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { FeatureKind, TenantCostDoc } from '@/types/cost';

function todayUtcYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getDailyTotal(tenantId: string): Promise<number> {
  const db = getAdminFirestoreService();
  const date = todayUtcYmd();
  const snap = await db.doc(`tenants/${tenantId}/_costs/${date}`).get();
  if (!snap.exists) return 0;
  const data = snap.data() as TenantCostDoc | undefined;
  return data?.totalCost ?? 0;
}

export async function getMonthlyTotal(tenantId: string): Promise<number> {
  const db = getAdminFirestoreService();
  const yearMonth = currentYearMonth();
  const snap = await db
    .collection(`tenants/${tenantId}/_costs`)
    .where('date', '>=', `${yearMonth}-01`)
    .where('date', '<=', `${yearMonth}-31`)
    .get();
  let total = 0;
  for (const doc of snap.docs) {
    total += (doc.data() as TenantCostDoc).totalCost ?? 0;
  }
  return total;
}

export async function getDailyFeatureSpend(
  tenantId: string,
  feature: FeatureKind
): Promise<number> {
  const db = getAdminFirestoreService();
  const date = todayUtcYmd();
  const snap = await db.doc(`tenants/${tenantId}/_costs/${date}`).get();
  if (!snap.exists) return 0;
  const data = snap.data() as TenantCostDoc | undefined;
  return data?.byFeature?.[feature]?.cost ?? 0;
}
