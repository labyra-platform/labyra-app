/**
 * Quota enforcement + usage tracking.
 * @phase R160-ai-5b-1
 *
 * Quota check at API boundary. Track after operation succeeds.
 */
import 'server-only';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { getTierLimits, SOFT_CAP_FRACTION, type TenantTier, type TenantLimits } from './tiers';
import type { UsageAction, MonthlyUsage } from '@/types/papers';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getTenantTier(tenantId: string): Promise<TenantTier> {
  const db = getAdminFirestoreService();
  const snap = await db.collection('tenants').doc(tenantId).get();
  const data = snap.data();
  const tier = data?.tier as TenantTier | undefined;
  return tier ?? 'free';
}

async function getMonthlyUsage(tenantId: string, yearMonth: string): Promise<MonthlyUsage> {
  const db = getAdminFirestoreService();
  const snap = await db.doc(`tenants/${tenantId}/usage/${yearMonth}`).get();
  if (!snap.exists) {
    return {
      schemaVersion: 1,
      tenantId,
      yearMonth,
      papersCount: 0,
      embedTokens: 0,
      reasoningTokens: 0,
      storageBytes: 0,
      costUsd: 0,
      updatedAt: Date.now()
    };
  }
  return snap.data() as MonthlyUsage;
}

function getCurrentValue(usage: MonthlyUsage, action: UsageAction): number {
  switch (action) {
    case 'paper':
      return usage.papersCount;
    case 'embedTokens':
      return usage.embedTokens;
    case 'reasoningTokens':
      return usage.reasoningTokens;
    case 'storage':
      return usage.storageBytes;
  }
}

function getLimitValue(limits: TenantLimits, action: UsageAction): number {
  switch (action) {
    case 'paper':
      return limits.papersPerMonth;
    case 'embedTokens':
      return limits.embedTokensPerMonth;
    case 'reasoningTokens':
      return limits.reasoningTokensPerMonth;
    case 'storage':
      return limits.storageBytes;
  }
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
  /** Percentage used (0.0 - 1.0+) */
  fraction: number;
  /** Soft cap warning */
  warning?: boolean;
}

/**
 * Check if a tenant can perform `action` of size `amount`.
 * Hard cap: rejects if current + amount > limit.
 * Soft cap: allows but flags warning at 90%.
 */
export async function checkQuota(
  tenantId: string,
  action: UsageAction,
  amount: number
): Promise<QuotaCheck> {
  const yearMonth = currentYearMonth();
  const [tier, usage] = await Promise.all([
    getTenantTier(tenantId),
    getMonthlyUsage(tenantId, yearMonth)
  ]);

  const limits = getTierLimits(tier);
  const current = getCurrentValue(usage, action);
  const limit = getLimitValue(limits, action);

  // Check cost cap (over all actions)
  if (usage.costUsd >= limits.monthlyCostCapUsd) {
    return {
      allowed: false,
      reason: `monthly_cost_cap_exceeded: $${usage.costUsd.toFixed(2)} >= $${limits.monthlyCostCapUsd}`,
      current: usage.costUsd,
      limit: limits.monthlyCostCapUsd,
      fraction: usage.costUsd / limits.monthlyCostCapUsd
    };
  }

  // Check action-specific quota
  const projected = current + amount;
  const fraction = projected / limit;

  if (projected > limit) {
    return {
      allowed: false,
      reason: `${action}_quota_exceeded: ${projected} > ${limit}`,
      current,
      limit,
      fraction
    };
  }

  return {
    allowed: true,
    current,
    limit,
    fraction,
    warning: fraction >= SOFT_CAP_FRACTION
  };
}

/**
 * Increment usage counters after a successful operation.
 * Optionally adds to costUsd.
 */
export async function trackUsage(
  tenantId: string,
  action: UsageAction,
  amount: number,
  costUsd: number = 0
): Promise<void> {
  const yearMonth = currentYearMonth();
  const db = getAdminFirestoreService();
  const ref = db.doc(`tenants/${tenantId}/usage/${yearMonth}`);

  const field = (() => {
    switch (action) {
      case 'paper':
        return 'papersCount';
      case 'embedTokens':
        return 'embedTokens';
      case 'reasoningTokens':
        return 'reasoningTokens';
      case 'storage':
        return 'storageBytes';
    }
  })();

  await ref.set(
    {
      schemaVersion: 1,
      tenantId,
      yearMonth,
      [field]: FieldValue.increment(amount),
      costUsd: FieldValue.increment(costUsd),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
}

/** Re-fund quota (used on cancellation / failure cleanup) */
export async function refundUsage(
  tenantId: string,
  action: UsageAction,
  amount: number,
  costUsd: number = 0
): Promise<void> {
  return trackUsage(tenantId, action, -amount, -costUsd);
}
