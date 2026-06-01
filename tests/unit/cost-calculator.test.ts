import { describe, expect, it } from 'vitest';
import { calculateCost, getPricingNotes } from '@/lib/ai/providers/cost-calculator';

/**
 * G-8 guardrail (R190-2).
 *
 * Context: R190-1 fixed a Tier-0 pricing-key mismatch
 * ('gemini-3.1-flash-lite-preview' in PRICING vs 'gemini-3.1-flash-lite'
 * emitted by CAPABILITY_MAP). At the time, calculateCost() returned $0 on an
 * unknown model, so the defect was silent for ~2 weeks and under-counted Cost Guard
 * per-tenant caps. This suite makes "a tier model has no price" a CI failure.
 *
 * CONTRACT: TIER_MODELS below is the canonical billable set. It MUST stay in
 * sync with CAPABILITY_MAP in src/lib/ai/config/capabilities.ts. Adding a tier
 * there without adding it here (and giving it a PRICING entry) fails this test
 * on purpose — pricing is a conscious decision, not an afterthought.
 */
const TIER_MODELS = [
  'gemini-3.1-flash-lite', // T0  Shield + Router (GA 2026-05-07)
  'gemini-3-flash-preview', // T1 + T2  Lab Manager + Librarian RAG
  'claude-sonnet-4-6', // T3 + T4
  'claude-opus-4-7' // T5  audit
] as const;

describe('cost-calculator G-8: every tier model has a PRICING entry', () => {
  it.each(TIER_MODELS)('%s is priced (not an unknown -> $0 model)', (model) => {
    // getPricingNotes returns null iff the model is absent from PRICING,
    // which is exactly the branch that silently returned $0.
    expect(getPricingNotes(model)).not.toBeNull();
  });

  it.each(TIER_MODELS)('%s produces non-zero cost for non-zero tokens', (model) => {
    const { usd } = calculateCost(model, 1000, 1000);
    expect(usd).toBeGreaterThan(0);
  });
});

describe('cost-calculator: T0 GA price regression (R190-1)', () => {
  it('gemini-3.1-flash-lite charges $0.25/M input, $1.50/M output', () => {
    // 1M input + 1M output, no cache, no tokenizer inflation.
    const { usd } = calculateCost('gemini-3.1-flash-lite', 1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(0.25 + 1.5, 6);
  });

  it('gemini-3.1-flash-lite GA cache rates: $0.20/M read, $0.50/M write', () => {
    // 0 fresh input/output; 1M cache-read + 1M cache-write.
    const { usd } = calculateCost('gemini-3.1-flash-lite', 0, 0, 1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(0.2 + 0.5, 6);
  });
});

describe('cost-calculator: unknown model falls back to most-expensive tier (AI-3)', () => {
  it('prices an unmapped model at claude-opus-4-8 rates, never $0', () => {
    const { usd } = calculateCost('totally-not-a-model', 1000, 1000);
    // AI-3 fix: an unknown model falls back to opus-4-8 ($5/M in, $25/M out, ×1.35
    // inflation) so the Cost Guard still trips + spend is over- (never under-)
    // estimated. Returning $0 here silently disabled the guard for ~2 weeks (R190-1).
    // (1000×1.35/1e6)×5 + (1000×1.35/1e6)×25 = 0.00675 + 0.03375 = 0.0405
    expect(usd).toBeCloseTo(0.0405, 6);
    expect(usd).toBeGreaterThan(0);
  });
});
