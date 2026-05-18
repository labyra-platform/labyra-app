/**
 * Cost estimator — predict per-request cost BEFORE calling LLM.
 * Used by Cost Guard pre-check (R170-5).
 *
 * Conservative upper-bound estimates. Reconcile with actual cost via recordCost().
 *
 * @phase R170-5
 */

import { CAPABILITY_MAP, TIER_CAPABILITY } from '@/lib/ai/config/capabilities';
import type { AiTier } from '@/types/ai';
import type { FeatureKind } from '@/types/cost';

interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** Conservative per-tier token estimates (upper bound). Adjust quarterly from telemetry. */
const TOKEN_ESTIMATES_BY_TIER: Record<AiTier, TokenEstimate> = {
  0: { inputTokens: 1000, outputTokens: 150, cacheReadTokens: 800 },
  1: { inputTokens: 2000, outputTokens: 500, cacheReadTokens: 1500 },
  2: { inputTokens: 5000, outputTokens: 1500, cacheReadTokens: 3000 },
  3: { inputTokens: 8000, outputTokens: 3000, cacheReadTokens: 5000 },
  4: { inputTokens: 15000, outputTokens: 8000, cacheReadTokens: 10000 },
  5: { inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 3000 }
};

/**
 * Estimate cost in USD for a tier + feature combination.
 * Currently feature-agnostic — same estimate per tier regardless of feature.
 * Future R171+ can vary by feature if telemetry shows divergence.
 */
export function estimateCost(tier: AiTier, _feature: FeatureKind): number {
  const profile = CAPABILITY_MAP[TIER_CAPABILITY[tier]];
  const est = TOKEN_ESTIMATES_BY_TIER[tier];
  const inflation = profile.tokenizerInflation ?? 1.0;

  const uncachedInput = est.inputTokens - est.cacheReadTokens;
  return (
    ((uncachedInput * inflation) / 1_000_000) * profile.inputCost +
    ((est.cacheReadTokens * inflation) / 1_000_000) * profile.cacheReadCost +
    ((est.outputTokens * inflation) / 1_000_000) * profile.outputCost
  );
}
