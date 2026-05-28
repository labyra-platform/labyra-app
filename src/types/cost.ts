/**
 * Cost telemetry types — tenant cost aggregate documents.
 * @phase R169-3 base, R170-3 latency + token extension, R170-4 grounding
 */

import type { Capability } from '@/lib/ai/config/capabilities';
import type { AiTier } from './ai';

/** Feature kind that triggered an AI call (for cost attribution) */
export type FeatureKind =
  | 'chat'
  | 'lab_ops'
  | 'theory'
  | 'spectrum_analysis'
  | 'paper_writing'
  | 'audit'
  | 'title_generation'
  | 'intent_classify'
  | 'classify' // R178-3 paper domain classification — @r178-3-applied
  | 'fact_extraction' // R193 ADR-035 M2 memory fact extraction
  | 'translate' // R237-C5 in-reader passage translation
  | 'paper_qa'; // R237am Ask AI Q&A inside a single paper

/** Per-capability stats (R170-3 extended) */
export interface CapabilityStats {
  cost: number;
  /** Total queries through this capability */
  queries?: number;
  /** Total input tokens consumed */
  inputTokens?: number;
  /** Total output tokens generated */
  outputTokens?: number;
  /** Total latency milliseconds (sum) */
  latencyMsTotal?: number;
}

/** Per-feature stats (R170-3 + R170-4 grounding) */
export interface FeatureStats {
  cost: number;
  queries: number;
  /** R170-4: Hallucination signals aggregated */
  unverifiedNumbersTotal?: number;
  unsourcedClaimsTotal?: number;
}

/** Daily cost aggregate per tenant. Path: tenants/{tid}/_costs/{yyyy-mm-dd} */
export interface TenantCostDoc {
  schemaVersion: 1 | 2;
  date: string; // YYYY-MM-DD
  tenantId: string;
  totalCost: number;
  byTier: Partial<
    Record<
      AiTier,
      {
        queries: number;
        cost: number;
      }
    >
  >;
  byCapability: Partial<Record<Capability, CapabilityStats>>;
  byFeature: Partial<Record<FeatureKind, FeatureStats>>;
  updatedAt: number; // epoch ms
}

export interface CostTelemetryInput {
  tenantId: string;
  tier: AiTier;
  capability: Capability;
  feature: FeatureKind;
  costUsd: number;
  /** R170-3: actual token consumption */
  inputTokens?: number;
  outputTokens?: number;
  /** R170-3: end-to-end latency in ms */
  latencyMs?: number;
  /** R170-4: hallucination signals */
  unverifiedNumbers?: number;
  unsourcedClaims?: number;
}
