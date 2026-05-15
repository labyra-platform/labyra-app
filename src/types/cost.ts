/**
 * Cost telemetry types — tenant cost aggregate documents.
 * @phase R169-3
 */

import type { AiTier } from './ai';
import type { Capability } from '@/lib/ai/config/capabilities';

/** Feature kind that triggered an AI call (for cost attribution) */
export type FeatureKind =
  | 'chat'
  | 'lab_ops'
  | 'theory'
  | 'spectrum_analysis'
  | 'paper_writing'
  | 'audit'
  | 'title_generation'
  | 'intent_classify';

/** Daily cost aggregate per tenant. Path: tenants/{tid}/_costs/{yyyy-mm-dd} */
export interface TenantCostDoc {
  schemaVersion: 1;
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
  byCapability: Partial<
    Record<
      Capability,
      {
        cost: number;
      }
    >
  >;
  byFeature: Partial<
    Record<
      FeatureKind,
      {
        cost: number;
        queries: number;
      }
    >
  >;
  updatedAt: number; // epoch ms
}

export interface CostTelemetryInput {
  tenantId: string;
  tier: AiTier;
  capability: Capability;
  feature: FeatureKind;
  costUsd: number;
}
