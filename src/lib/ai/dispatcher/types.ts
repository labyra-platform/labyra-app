/**
 * Dispatcher types — Haiku 4.5 intent classification output.
 * @phase R160-ai-3b
 */
import type { AiTier } from '@/types/ai';

export interface IntentDecision {
  /** Chosen tier */
  tier: AiTier;
  /** Brief reason (for logging + provenance) */
  reason: string;
  /** Confidence 0.0-1.0 — below 0.7 falls back to Tier 2 */
  confidence: number;
  /** Classifier cost (USD) */
  classifierCostUsd: number;
  /** Classifier latency (ms) */
  classifierLatencyMs: number;
}
