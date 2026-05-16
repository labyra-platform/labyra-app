/**
 * Capability abstraction — single source of truth for AI model assignments.
 *
 * Pattern: Tier number → Capability → Model profile.
 *
 * Why: changing a model (e.g. Opus 4.7 → 4.8 when released) should be a
 * single-file change. Hardcoding model strings in tier handlers makes vendor
 * swap painful. This abstraction makes it trivial.
 *
 * Stack (verified 2026-05-17, R176-2bc):
 *   T0    → gemini-3.1-flash-lite (GA)
 *   T1+T2 → gemini-3-flash-preview (GA on Vertex AI, preview on Gemini API)
 *   T3+T4 → claude-sonnet-4-6
 *   T5    → claude-opus-4-7 (+35% tokenizer)
 *
 * R176-2a migrated SDK @google/generative-ai → @google/genai 2.3.0
 *   which auto-handles thought_signature (Gemini 3 requirement).
 *
 * @phase R169-1
 * @see docs/adr/ADR-019-ai-tier-architecture.md
 */
import type { AiTier } from '@/types/ai';

/** Capability — semantic role independent of which model implements it */
export type Capability =
  | 'security-router' // Tier 0
  | 'tool-calling-cheap' // Tier 1
  | 'rag-balanced' // Tier 2
  | 'reasoning-balanced' // Tier 3, Tier 4
  | 'reasoning-frontier' // Tier 5
  | 'embedding' // RAG indexing (separate from chat)
  | 'rerank' // RAG post-retrieval
  | 'ocr'; // Paper upload one-time

export type LLMProvider = 'anthropic' | 'google' | 'voyage' | 'mistral';

export interface CapabilityProfile {
  provider: LLMProvider;
  model: string;
  /** USD per 1M input tokens */
  inputCost: number;
  /** USD per 1M output tokens */
  outputCost: number;
  /** USD per 1M cached input tokens (typically 10% of input) */
  cacheReadCost: number;
  /** Max output tokens for this capability */
  maxTokens: number;
  /** Context window size in tokens */
  contextWindow: number;
  /** Token inflation factor (Opus 4.7 = 1.35 vs Opus 4.6) */
  tokenizerInflation?: number;
  /** Status / deprecation notes */
  notes?: string;
}

/** Capability → model profile. Edit here to swap models. */
export const CAPABILITY_MAP: Record<Capability, CapabilityProfile> = {
  'security-router': {
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    inputCost: 0.25,
    outputCost: 1.5,
    cacheReadCost: 0.025,
    maxTokens: 512,
    contextWindow: 1_000_000,
    notes:
      'R176-2bc-gemini-3-swap: re-adopted after @google/genai SDK 2.3.0 auto-handles thought_signature. GA model since 2026-05-07.'
  },
  'tool-calling-cheap': {
    provider: 'google',
    model: 'gemini-3-flash-preview',
    inputCost: 0.5,
    outputCost: 3.0,
    cacheReadCost: 0.05,
    maxTokens: 2048,
    contextWindow: 1_000_000,
    notes:
      'R176-2bc-gemini-3-swap: GA gemini-3-flash not yet on Gemini API (Vertex AI only). Using -preview which is functionally GA quality. Migrate to gemini-3-flash when published.'
  },
  'rag-balanced': {
    provider: 'google',
    model: 'gemini-3-flash-preview',
    inputCost: 0.5,
    outputCost: 3.0,
    cacheReadCost: 0.05,
    maxTokens: 4096,
    contextWindow: 1_000_000,
    notes:
      'R176-2bc-gemini-3-swap: re-adopted Gemini 3 after R176-2a SDK migration (@google/genai 2.3.0). Same pricing as legacy 2.5-flash configuration estimate, actual model is 3-flash-preview.'
  },
  'reasoning-balanced': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    inputCost: 3.0,
    outputCost: 15.0,
    cacheReadCost: 0.3,
    maxTokens: 8192,
    contextWindow: 1_000_000,
    notes: 'Stable. Best reasoning + tool calling balance.'
  },
  'reasoning-frontier': {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    inputCost: 5.0,
    outputCost: 25.0,
    cacheReadCost: 0.5,
    maxTokens: 4096,
    contextWindow: 1_000_000,
    tokenizerInflation: 1.35,
    notes: '+35% tokenizer inflation vs Opus 4.6 (factor applied automatically).'
  },
  embedding: {
    provider: 'voyage',
    model: 'voyage-3-large',
    inputCost: 0.18,
    outputCost: 0,
    cacheReadCost: 0,
    maxTokens: 0,
    contextWindow: 32_000,
    notes: '1024-dim, paired with rerank-2.5. Pinecone index matched.'
  },
  rerank: {
    provider: 'voyage',
    model: 'rerank-2.5',
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    maxTokens: 0,
    contextWindow: 8_192,
    notes: 'Designed pair with voyage-3-large. Per-query billing.'
  },
  ocr: {
    provider: 'mistral',
    model: 'mistral-ocr',
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    maxTokens: 0,
    contextWindow: 0,
    notes: '~$1/1000 pages. One-time per paper upload.'
  }
};

/**
 * Tier → Capability mapping.
 *
 * Note: T0 (Shield+Router) and T1 (Lab Manager) both map to
 * 'security-router' currently. They may diverge in R171+ if Tier 1 needs
 * larger maxTokens; that would change one line here.
 */
export const TIER_CAPABILITY: Record<AiTier, Capability> = {
  0: 'security-router',
  1: 'tool-calling-cheap',
  2: 'rag-balanced',
  3: 'reasoning-balanced',
  4: 'reasoning-balanced',
  5: 'reasoning-frontier'
};

/** Get model string for a tier (replaces hardcoded model strings) */
export function getModelForTier(tier: AiTier): string {
  return CAPABILITY_MAP[TIER_CAPABILITY[tier]].model;
}

/** Get capability for a tier */
export function getCapabilityForTier(tier: AiTier): Capability {
  return TIER_CAPABILITY[tier];
}

/** Get full profile for a capability */
export function getCapabilityProfile(capability: Capability): CapabilityProfile {
  return CAPABILITY_MAP[capability];
}

/** Get profile by tier (convenience) */
export function getProfileForTier(tier: AiTier): CapabilityProfile {
  return CAPABILITY_MAP[TIER_CAPABILITY[tier]];
}
