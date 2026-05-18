/**
 * Cost Guard v2 — pre-call check enforcing 4 gates.
 *
 * Gates:
 *   1. Daily total cap
 *   2. Monthly total cap
 *   3. Daily Opus quota (Tier 5)
 *   4. Per-feature daily cap
 *
 * @phase R170-5
 * @see docs/adr/ADR-020-ai-cost-controls.md
 */
import 'server-only';
import { getDailyFeatureSpend, getDailyTotal, getMonthlyTotal } from '@/lib/ai/cost/aggregator';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { AiTier } from '@/types/ai';
import type { FeatureKind } from '@/types/cost';
import type { TenantTier } from './tiers';

export interface CostGuardCheck {
  allowed: boolean;
  reason?: string;
  dailyCurrent: number;
  dailyLimit: number;
  monthlyCurrent: number;
  monthlyLimit: number;
}

interface CostLimits {
  daily: { total: number; opus: number };
  monthly: { total: number };
  perFeature: Partial<Record<FeatureKind, number>>;
}

export const COST_LIMITS: Record<TenantTier, CostLimits> = {
  free: {
    daily: { total: 0.5, opus: 0.1 },
    monthly: { total: 5 },
    perFeature: {
      spectrum_analysis: 0.3,
      paper_writing: 0.1,
      theory: 0.2,
      lab_ops: 0.1
    }
  },
  starter: {
    daily: { total: 2.0, opus: 0.5 },
    monthly: { total: 50 },
    perFeature: {
      spectrum_analysis: 1.0,
      paper_writing: 0.5,
      theory: 0.5,
      lab_ops: 0.5
    }
  },
  pro: {
    daily: { total: 5.0, opus: 1.5 },
    monthly: { total: 100 },
    perFeature: {
      spectrum_analysis: 3.0,
      paper_writing: 1.5,
      theory: 1.5,
      lab_ops: 1.0
    }
  },
  enterprise: {
    daily: { total: Infinity, opus: Infinity },
    monthly: { total: Infinity },
    perFeature: {}
  }
};

async function getTenantTier(tenantId: string): Promise<TenantTier> {
  const db = getAdminFirestoreService();
  const snap = await db.collection('tenants').doc(tenantId).get();
  const data = snap.data();
  return (data?.tier as TenantTier | undefined) ?? 'free';
}

export async function checkCostGuard(
  tenantId: string,
  tier: AiTier,
  feature: FeatureKind,
  estimatedCost: number
): Promise<CostGuardCheck> {
  const [tenantTier, dailyCurrent, monthlyCurrent] = await Promise.all([
    getTenantTier(tenantId),
    getDailyTotal(tenantId),
    getMonthlyTotal(tenantId)
  ]);

  const limits = COST_LIMITS[tenantTier];

  if (dailyCurrent + estimatedCost > limits.daily.total) {
    return {
      allowed: false,
      reason: `daily_total_exceeded: $${dailyCurrent.toFixed(4)} + $${estimatedCost.toFixed(4)} > $${limits.daily.total}`,
      dailyCurrent,
      dailyLimit: limits.daily.total,
      monthlyCurrent,
      monthlyLimit: limits.monthly.total
    };
  }

  if (monthlyCurrent + estimatedCost > limits.monthly.total) {
    return {
      allowed: false,
      reason: `monthly_total_exceeded: $${monthlyCurrent.toFixed(2)} + $${estimatedCost.toFixed(4)} > $${limits.monthly.total}`,
      dailyCurrent,
      dailyLimit: limits.daily.total,
      monthlyCurrent,
      monthlyLimit: limits.monthly.total
    };
  }

  if (tier === 5 && estimatedCost > limits.daily.opus) {
    return {
      allowed: false,
      reason: `daily_opus_exceeded: $${estimatedCost.toFixed(4)} > $${limits.daily.opus} (tier 5)`,
      dailyCurrent,
      dailyLimit: limits.daily.total,
      monthlyCurrent,
      monthlyLimit: limits.monthly.total
    };
  }

  const featureCap = limits.perFeature[feature];
  if (featureCap !== undefined) {
    const featureCurrent = await getDailyFeatureSpend(tenantId, feature);
    if (featureCurrent + estimatedCost > featureCap) {
      return {
        allowed: false,
        reason: `${feature}_daily_exceeded: $${featureCurrent.toFixed(4)} + $${estimatedCost.toFixed(4)} > $${featureCap}`,
        dailyCurrent,
        dailyLimit: limits.daily.total,
        monthlyCurrent,
        monthlyLimit: limits.monthly.total
      };
    }
  }

  return {
    allowed: true,
    dailyCurrent,
    dailyLimit: limits.daily.total,
    monthlyCurrent,
    monthlyLimit: limits.monthly.total
  };
}
