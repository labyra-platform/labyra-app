/**
 * Per-model cost calculation. Single source of truth for AI pricing.
 *
 * Prices in USD per 1M tokens (verified 2026-05-16 from official Anthropic
 * + Google Gemini pricing pages).
 *
 * IMPORTANT: This is the authoritative pricing table. All cost estimation
 * MUST use this calculator. Do not hardcode prices elsewhere.
 *
 * @phase R160-ai-3a base, R168-3.13b pricing refresh
 * @see docs/adr/ADR-020-ai-cost-controls.md
 */

import type { AiCostBreakdown } from '@/types/ai';

interface ModelPricing {
  /** Input tokens, USD per 1M */
  inputPerM: number;
  /** Output tokens, USD per 1M */
  outputPerM: number;
  /** Cache read, USD per 1M (typically 10% of input for Anthropic, similar for Gemini) */
  cacheReadPerM: number;
  /** Cache write, USD per 1M (typically 1.25x input for Anthropic 5min cache) */
  cacheWritePerM: number;
  /**
   * Tokenizer inflation factor — multiply estimated tokens by this.
   * Opus 4.7 ships with new tokenizer producing up to +35% tokens vs 4.6.
   * Per-token rate unchanged, but effective cost per request increases.
   * Source: https://www.anthropic.com/news/opus-4-7
   */
  tokenizerInflation?: number;
  /** Status note */
  notes?: string;
}

const PRICING: Record<string, ModelPricing> = {
  // ─── Anthropic Claude family (verified 2026-05) ─────────────
  'claude-opus-4-7': {
    inputPerM: 5,
    outputPerM: 25,
    cacheReadPerM: 0.5,
    cacheWritePerM: 6.25,
    tokenizerInflation: 1.35, // +35% same text vs Opus 4.6
    notes: 'Frontier reasoning. Use for Tier 5 audit only.'
  },
  'claude-sonnet-4-6': {
    inputPerM: 3,
    outputPerM: 15,
    cacheReadPerM: 0.3,
    cacheWritePerM: 3.75,
    notes: 'Balanced reasoning. Tier 3 + 4.'
  },
  'claude-haiku-4-5-20251001': {
    inputPerM: 1,
    outputPerM: 5,
    cacheReadPerM: 0.1,
    cacheWritePerM: 1.25,
    notes: 'Not currently in tier assignments. Reserved for future failover.'
  },

  // ─── Google Gemini family (verified 2026-05) ────────────────
  // R168-3.13b: previous gemini-2.5-flash entry had WRONG pricing
  // ($0.075/$0.30). Official is $0.30/$2.50. Plus 2.5 Flash deprecates
  // June 2026 — kept here for any legacy callers but not assigned to tiers.
  'gemini-2.5-flash': {
    inputPerM: 0.3,
    outputPerM: 2.5,
    cacheReadPerM: 0.075,
    cacheWritePerM: 0.3,
    notes: '⚠ Deprecates June 2026. Migrate to gemini-3-flash-preview.'
  },
  'gemini-2.5-flash-lite': {
    inputPerM: 0.1,
    outputPerM: 0.4,
    cacheReadPerM: 0.025,
    cacheWritePerM: 0.1,
    notes: 'GA stable. Backup option if 3.1-flash-lite-preview pricing changes at GA.'
  },
  // R190-1: GA rename. 3.1 Flash-Lite went GA 2026-05-07; CAPABILITY_MAP
  // emits 'gemini-3.1-flash-lite' (no -preview) but this key lagged ->
  // PRICING miss -> T0 billed $0 for ~2 weeks. Key + GA cache rates fixed.
  // GA caching: $0.20/M read, $0.50/M write (was preview 0.025/0.25).
  'gemini-3.1-flash-lite': {
    inputPerM: 0.25,
    outputPerM: 1.5,
    cacheReadPerM: 0.2,
    cacheWritePerM: 0.5,
    notes: 'Tier 0 (Shield+Router). GA 2026-05-07. Input is cache-miss rate.'
  },
  // R168-3.13b: VERIFIED — Tier 2 model
  'gemini-3-flash-preview': {
    inputPerM: 0.5,
    outputPerM: 3.0,
    cacheReadPerM: 0.05,
    cacheWritePerM: 0.5,
    notes: 'Tier 2 (Librarian RAG). Preview pricing.'
  },
  'gemini-2.5-pro': {
    inputPerM: 1.25,
    outputPerM: 5.0,
    cacheReadPerM: 0.3125,
    cacheWritePerM: 1.25,
    notes: 'Not in tier assignments. Available for ad-hoc use.'
  }
};

/**
 * Calculate cost for a single AI request.
 *
 * @param model — model string (must match key in PRICING table)
 * @param inputTokens — base input tokens (not yet inflated)
 * @param outputTokens — base output tokens
 * @param cacheReadTokens — cached portion of input (if any)
 * @param cacheWriteTokens — input tokens written to cache (1.25× cost)
 * @returns Cost breakdown with tokenizer inflation applied
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): AiCostBreakdown {
  const pricing = PRICING[model];
  if (!pricing) {
    // AI-3 fix: a renamed/GA'd model id missing from PRICING used to return $0,
    // which silently disables cost-guard (estimatedCost > limit always false) and
    // under-reports spend. This already happened once (see R190-1 note above: T0
    // billed $0 for ~2 weeks). Fall back to the most expensive tier so the guard
    // still trips and spend is over- (not under-) estimated. Loud-log for ops.
    // eslint-disable-next-line no-console -- audit log for unknown model
    console.error(
      `[cost-calculator] unknown model: ${model} — falling back to claude-opus-4-7 pricing (conservative). Add this model to PRICING.`
    );
    const fallback = PRICING['claude-opus-4-7'];
    const inflation = fallback.tokenizerInflation ?? 1.0;
    const usd =
      ((inputTokens * inflation) / 1_000_000) * fallback.inputPerM +
      ((outputTokens * inflation) / 1_000_000) * fallback.outputPerM +
      ((cacheReadTokens * inflation) / 1_000_000) * fallback.cacheReadPerM +
      ((cacheWriteTokens * inflation) / 1_000_000) * fallback.cacheWritePerM;
    return {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      usd: Number(usd.toFixed(6))
    };
  }

  // R168-3.13b: apply tokenizer inflation factor for Opus 4.7
  // (token counts grow ~35% same text vs Opus 4.6 baseline).
  const inflation = pricing.tokenizerInflation ?? 1.0;
  const adjustedInput = inputTokens * inflation;
  const adjustedOutput = outputTokens * inflation;
  const adjustedCacheRead = cacheReadTokens * inflation;
  const adjustedCacheWrite = cacheWriteTokens * inflation;

  const usd =
    (adjustedInput / 1_000_000) * pricing.inputPerM +
    (adjustedOutput / 1_000_000) * pricing.outputPerM +
    (adjustedCacheRead / 1_000_000) * pricing.cacheReadPerM +
    (adjustedCacheWrite / 1_000_000) * pricing.cacheWritePerM;

  return {
    inputTokens, // report base, not inflated
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usd: Number(usd.toFixed(6))
  };
}

/**
 * Get pricing notes for a model (for UI display / audit).
 * @param model — model string
 * @returns notes string or null if model unknown
 */
export function getPricingNotes(model: string): string | null {
  return PRICING[model]?.notes ?? null;
}

/**
 * Check if model is currently assigned to a Labyra tier.
 * Used for budget enforcement — non-tier models are not auto-billable.
 */
export function isTierModel(model: string): boolean {
  const tierModels = new Set([
    'gemini-3.1-flash-lite', // T0
    'gemini-3-flash-preview', // T2
    'claude-sonnet-4-6', // T3, T4
    'claude-opus-4-7' // T5
  ]);
  return tierModels.has(model);
}
