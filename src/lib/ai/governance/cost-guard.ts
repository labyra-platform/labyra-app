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
      lab_ops: 0.1,
      translate: 0.1, // ~150 full-page drags/day
      paper_qa: 0.2 // ~40 questions/day (Flash easy + occasional Sonnet)
    }
  },
  starter: {
    daily: { total: 2.0, opus: 0.5 },
    monthly: { total: 50 },
    perFeature: {
      spectrum_analysis: 1.0,
      paper_writing: 0.5,
      theory: 0.5,
      lab_ops: 0.5,
      translate: 0.5,
      paper_qa: 1.0
    }
  },
  pro: {
    daily: { total: 5.0, opus: 1.5 },
    monthly: { total: 100 },
    perFeature: {
      spectrum_analysis: 3.0,
      paper_writing: 1.5,
      theory: 1.5,
      lab_ops: 1.0,
      translate: 2.0,
      paper_qa: 4.0
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

  // AI-14: a FeatureKind absent from limits.perFeature previously skipped the
  // per-feature gate entirely (undefined cap → no check) → unbounded spend on
  // that feature until the daily/monthly total trips. Apply a conservative
  // default (the daily total cap) for unmapped features so a new/unmapped
  // feature can't silently outspend its intended budget, and log it so the
  // missing entry gets added to COST_LIMITS.
  const mappedCap = limits.perFeature[feature];
  let featureCap = mappedCap;
  if (mappedCap === undefined) {
    // eslint-disable-next-line no-console -- ops signal: feature missing a cap
    console.warn(
      `[cost-guard] feature "${feature}" has no per-feature cap; defaulting to daily total $${limits.daily.total}. Add it to COST_LIMITS.perFeature.`
    );
    featureCap = limits.daily.total;
  }
  // R238a AI-PERF-5: the 3 reads above already run in parallel; the only wasted
  // read on the happy path is this conditional per-feature lookup. When the cap is
  // Infinity (enterprise) the check can never trip, so skip the round-trip.
  // NB: we do NOT short-circuit on a small estimatedCost — a tiny call must still
  // be blocked if the tenant already exceeded their daily/monthly accumulated spend.
  if (featureCap !== undefined && featureCap !== Infinity) {
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
