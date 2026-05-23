import { describe, expect, it } from 'vitest';
import { selectEvictions, MAX_FACTS_PER_USER } from '@/lib/ai/memory/fact-store';

type F = {
  id: string;
  subject: string;
  confidence: number;
  extractedAt: number;
  verifiedAt: number | null;
};

function mk(
  id: string,
  subject: string,
  confidence: number,
  extractedAt: number,
  verifiedAt: number | null = null
): F {
  return { id, subject, confidence, extractedAt, verifiedAt };
}

describe('selectEvictions (Q3 cap logic — not FIFO)', () => {
  it('frees 0 when slotsToFree <= 0', () => {
    expect(selectEvictions([mk('a', 'user.other', 0.8, 1)], 0)).toEqual([]);
  });

  it('evicts lowest-confidence first', () => {
    const facts = [
      mk('hi', 'user.other', 0.95, 100),
      mk('lo', 'user.other', 0.71, 200),
      mk('mid', 'user.other', 0.85, 300)
    ];
    expect(selectEvictions(facts, 1)).toEqual(['lo']);
  });

  it('tie-breaks by oldest', () => {
    const facts = [mk('new', 'user.other', 0.8, 300), mk('old', 'user.other', 0.8, 100)];
    expect(selectEvictions(facts, 1)).toEqual(['old']);
  });

  it('never evicts verified facts', () => {
    const facts = [
      mk('verified', 'user.other', 0.5, 100, 12345),
      mk('unverified', 'user.other', 0.99, 999)
    ];
    // even though unverified has higher confidence, verified is protected;
    // only unverified is eligible
    expect(selectEvictions(facts, 5)).toEqual(['unverified']);
  });

  it('never evicts HIGH_VALUE_SUBJECTS (research_focus, material_systems, expertise)', () => {
    const facts = [
      mk('core', 'user.research_focus', 0.5, 100),
      mk('mat', 'user.material_systems', 0.5, 110),
      mk('exp', 'user.expertise_level', 0.5, 120),
      mk('disposable', 'user.other', 0.99, 999)
    ];
    expect(selectEvictions(facts, 5)).toEqual(['disposable']);
  });

  it('returns at most slotsToFree ids', () => {
    const facts = Array.from({ length: 10 }, (_, i) =>
      mk(`f${i}`, 'user.other', 0.7 + i * 0.01, i)
    );
    expect(selectEvictions(facts, 3)).toHaveLength(3);
  });

  it('cap constant is 200', () => {
    expect(MAX_FACTS_PER_USER).toBe(200);
  });
});
