/**
 * Provider registry + selection.
 *
 * Phase ai-3a: hard-coded tier → provider mapping. In ai-3b, tier routing logic
 * (intent classifier) will pick tier dynamically based on user query.
 *
 * @phase R160-ai-3a
 */
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import type { LLMProvider, LLMProviderConfig } from './types';
import type { AiTier } from '@/types/ai';

/** Singleton instances — cheap, no client created until first call */
const ANTHROPIC = new AnthropicProvider();
const GEMINI = new GeminiProvider();

/** Tier → provider + model mapping per docs/ai/AI_ARCHITECTURE.md Section 2 */
export const TIER_CONFIG: Record<AiTier, LLMProviderConfig> = {
  1: {
    id: 'gemini',
    tier: 1,
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash'
  },
  2: {
    id: 'anthropic',
    tier: 2,
    model: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6'
  },
  3: {
    id: 'anthropic',
    tier: 3,
    model: 'claude-opus-4-7',
    label: 'Claude Opus 4.7'
  }
};

/** Bonus tier: Haiku for intent classification, title gen, NER */
export const HAIKU_DISPATCHER: LLMProviderConfig = {
  id: 'anthropic',
  tier: 1, // not used as a Tier, just for type compatibility
  model: 'claude-haiku-4-5-20251001',
  label: 'Claude Haiku 4.5'
};

/** Get the provider instance for a tier */
export function selectProvider(tier: AiTier): {
  provider: LLMProvider;
  config: LLMProviderConfig;
} {
  const config = TIER_CONFIG[tier];
  const provider = getProviderById(config.id);
  return { provider, config };
}

/** Get a specific provider by id (for direct calls like Haiku dispatcher) */
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

/** Get the Haiku dispatcher (for title gen, intent classification) */
export function getHaikuDispatcher(): {
  provider: LLMProvider;
  config: LLMProviderConfig;
} {
  return { provider: ANTHROPIC, config: HAIKU_DISPATCHER };
}
