import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the provider BEFORE importing the extractor.
const completeMock = vi.fn();
vi.mock('@/lib/ai/providers', () => ({
  getHaikuDispatcher: () => ({
    provider: { complete: completeMock },
    config: { model: 'gemini-3.1-flash-lite' }
  })
}));

import { extractFacts, FACT_CONFIDENCE_THRESHOLD } from '@/lib/ai/memory/fact-extractor';

function reply(text: string) {
  completeMock.mockResolvedValueOnce({ text, usage: { usd: 0.0001 } });
}

beforeEach(() => completeMock.mockReset());

describe('extractFacts parsing + filtering', () => {
  it('parses a valid fact array', async () => {
    reply(
      '[{"subject":"user.research_focus","object":"WO3","confidence":0.95,"sourceQuote":"tôi nghiên cứu WO3"}]'
    );
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0].subject).toBe('user.research_focus');
    expect(r.costUsd).toBeCloseTo(0.0001);
  });

  it('strips markdown code fences', async () => {
    reply(
      '```json\n[{"subject":"user.other","object":"x","confidence":0.8,"sourceQuote":"q"}]\n```'
    );
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(1);
  });

  it('drops facts below confidence threshold', async () => {
    reply(
      `[{"subject":"user.other","object":"x","confidence":${FACT_CONFIDENCE_THRESHOLD - 0.1},"sourceQuote":"q"}]`
    );
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
  });

  it('drops facts with invalid subject (not in taxonomy)', async () => {
    reply('[{"subject":"user.favorite_color","object":"blue","confidence":0.9,"sourceQuote":"q"}]');
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
  });

  it('drops facts missing sourceQuote (anti-hallucination)', async () => {
    reply('[{"subject":"user.other","object":"x","confidence":0.9}]');
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
  });

  it('returns [] on empty array', async () => {
    reply('[]');
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
  });

  it('returns [] on malformed JSON (non-fatal)', async () => {
    reply('not json at all');
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
  });

  it('returns [] when provider throws (best-effort)', async () => {
    completeMock.mockRejectedValueOnce(new Error('boom'));
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(0);
    expect(r.costUsd).toBe(0);
  });

  it('extracts JSON embedded in surrounding prose', async () => {
    reply(
      'Here are the facts: [{"subject":"user.other","object":"x","confidence":0.9,"sourceQuote":"q"}] done'
    );
    const r = await extractFacts({ userTurn: 'u', assistantTurn: 'a', existingFacts: [] });
    expect(r.facts).toHaveLength(1);
  });
});
