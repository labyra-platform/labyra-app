/**
 * Provider registry + selection.
 *
 * R169-2: TIER_CONFIG expanded from 3-tier to 6-tier.
 * Source of truth for model strings: src/lib/ai/config/capabilities.ts
 * (TIER_CONFIG references CAPABILITY_MAP — no duplicate model strings).
 *
 * @phase R160-ai-3a base, R169-2 6-tier expansion
 */
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import type { LLMProvider, LLMProviderConfig } from './types';
import type { AiTier } from '@/types/ai';
import { CAPABILITY_MAP, TIER_CAPABILITY } from '@/lib/ai/config/capabilities';

/** Singleton instances — cheap, no client created until first call */
const ANTHROPIC = new AnthropicProvider();
const GEMINI = new GeminiProvider();

/**
 * Tier → provider + model mapping.
 *
 * R169-2: Generated from CAPABILITY_MAP to ensure single source of truth.
 */
function buildTierConfig(): Record<AiTier, LLMProviderConfig> {
  const config: Partial<Record<AiTier, LLMProviderConfig>> = {};
  const labels: Record<AiTier, string> = {
    0: 'Shield + Router',
    1: 'Lab Manager',
    2: 'Librarian (RAG)',
    3: 'Engineer (Spectrum)',
    4: 'Writer (Draft)',
    5: 'Auditor (Peer Review)'
  };
  for (const t of [0, 1, 2, 3, 4, 5] as const) {
    const profile = CAPABILITY_MAP[TIER_CAPABILITY[t]];
    config[t] = {
      id: profile.provider === 'anthropic' ? 'anthropic' : 'gemini',
      tier: t,
      model: profile.model,
      label: `${labels[t]} (${profile.model})`
    };
  }
  return config as Record<AiTier, LLMProviderConfig>;
}

export const TIER_CONFIG: Record<AiTier, LLMProviderConfig> = buildTierConfig();

/**
 * Get the provider instance for a tier.
 * NOTE: Voyage + Mistral capabilities (embedding/rerank/ocr) NOT served here
 * because they're not chat providers. Direct clients in rag/embedding/ocr modules.
 */
export function selectProvider(tier: AiTier): {
  provider: LLMProvider;
  config: LLMProviderConfig;
} {
  const config = TIER_CONFIG[tier];
  const provider = getProviderById(config.id);
  return { provider, config };
}

export function getProviderById(id: 'anthropic' | 'gemini'): LLMProvider {
  switch (id) {
    case 'anthropic':
      return ANTHROPIC;
    case 'gemini':
      return GEMINI;
    default: {
      const _exhaustive: never = id;
      throw new Error(`unknown_provider: ${_exhaustive}`);
    }
  }
}

/**
 * Get the dispatcher for intent classification + title gen.
 *
 * R169-2: Switched from Haiku 4.5 to Gemini 3.1 Flash-Lite preview.
 * Same task (intent classify, ~150 output tokens) but 4× cheaper.
 * Cost impact at scale: $1.10/1K queries → $0.30/1K queries (-73%).
 */
export function getHaikuDispatcher(): {
  provider: LLMProvider;
  config: LLMProviderConfig;
} {
  return { provider: GEMINI, config: TIER_CONFIG[0] };
}
