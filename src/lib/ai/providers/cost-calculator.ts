/**
 * Per-model cost calculation. Single source of truth.
 * Prices in USD per 1M tokens (as of 2026-05).
 *
 * @phase R160-ai-3a
 */

import type { AiCostBreakdown } from '@/types/ai';

interface ModelPricing {
  /** Input tokens, USD per 1M */
  inputPerM: number;
  /** Output tokens, USD per 1M */
  outputPerM: number;
  /** Cache read, USD per 1M (typically 10% of input for Anthropic) */
  cacheReadPerM: number;
  /** Cache write, USD per 1M (typically 1.25x input for Anthropic) */
  cacheWritePerM: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic Claude family (2026-05 pricing)
  'claude-opus-4-7': { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 },
  'claude-haiku-4-5-20251001': {
    inputPerM: 1,
    outputPerM: 5,
    cacheReadPerM: 0.1,
    cacheWritePerM: 1.25
  },

  // Google Gemini family (free tier exists for dev)
  'gemini-2.5-flash': {
    inputPerM: 0.075,
    outputPerM: 0.3,
    cacheReadPerM: 0.01875,
    cacheWritePerM: 0.075
  },
  'gemini-2.5-pro': {
    inputPerM: 1.25,
    outputPerM: 5.0,
    cacheReadPerM: 0.3125,
    cacheWritePerM: 1.25
  }
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): AiCostBreakdown {
  const pricing = PRICING[model];
  if (!pricing) {
    console.warn(`[cost-calculator] unknown model: ${model}, returning 0 cost`);
    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      usd: 0
    };
  }

  const usd =
    (inputTokens / 1_000_000) * pricing.inputPerM +
    (outputTokens / 1_000_000) * pricing.outputPerM +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerM +
    (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerM;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usd: Number(usd.toFixed(6))
  };
}
