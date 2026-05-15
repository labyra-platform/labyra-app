/**
 * Dispatcher types — Tier 0 (Shield+Router) classifier output.
 * @phase R160-ai-3b base, R170-1 feature extension
 */
import type { AiTier } from '@/types/ai';
import type { FeatureKind } from '@/types/cost';

export interface IntentDecision {
  /** Chosen tier */
  tier: AiTier;
  /** Feature kind for cost attribution (R170-1) */
  feature: FeatureKind;
  /** Brief reason (for logging + provenance) */
  reason: string;
  /** Confidence 0.0-1.0 — below 0.7 falls back to Tier 2 */
  confidence: number;
  /** Classifier cost (USD) */
  classifierCostUsd: number;
  /** Classifier latency (ms) */
  classifierLatencyMs: number;
}
