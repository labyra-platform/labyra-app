/**
 * Tenant tier definitions for quota enforcement.
 * @phase R160-ai-5b-1
 * @see docs/labyra-strategy.md (pricing tiers section)
 */

export type TenantTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface TenantLimits {
  /** Papers ingested per month */
  papersPerMonth: number;
  /** Voyage embedding tokens per month */
  embedTokensPerMonth: number;
  /** Anthropic reasoning tokens per month (Sonnet+Opus) */
  reasoningTokensPerMonth: number;
  /** Storage in bytes */
  storageBytes: number;
  /** Hard monthly cost cap in USD */
  monthlyCostCapUsd: number;
}

const GB = 1024 * 1024 * 1024;
const M = 1_000_000;

export const TIER_LIMITS: Record<TenantTier, TenantLimits> = {
  free: {
    papersPerMonth: 10,
    embedTokensPerMonth: 1 * M,
    reasoningTokensPerMonth: 100_000,
    storageBytes: 1 * GB,
    monthlyCostCapUsd: 5
  },
  starter: {
    papersPerMonth: 100,
    embedTokensPerMonth: 10 * M,
    reasoningTokensPerMonth: 1 * M,
    storageBytes: 10 * GB,
    monthlyCostCapUsd: 50
  },
  pro: {
    papersPerMonth: 1000,
    embedTokensPerMonth: 100 * M,
    reasoningTokensPerMonth: 10 * M,
    storageBytes: 100 * GB,
    monthlyCostCapUsd: 500
  },
  enterprise: {
    papersPerMonth: Number.MAX_SAFE_INTEGER,
    embedTokensPerMonth: Number.MAX_SAFE_INTEGER,
    reasoningTokensPerMonth: Number.MAX_SAFE_INTEGER,
    storageBytes: Number.MAX_SAFE_INTEGER,
    monthlyCostCapUsd: Number.MAX_SAFE_INTEGER
  }
};

/** Soft cap threshold (warning UI) */
export const SOFT_CAP_FRACTION = 0.9;

export function getTierLimits(tier: TenantTier): TenantLimits {
  return TIER_LIMITS[tier];
}
