import { describe, expect, it } from 'vitest';

import { GLOSSARY_VI, glossaryBlock } from '@/features/papers/lib/translation-glossary';

describe('translation-glossary (R271)', () => {
  it('has no duplicate English keys (a dupe would double-list and confuse the model)', () => {
    const keys = GLOSSARY_VI.map((e) => e.en.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has non-empty en and vi', () => {
    for (const e of GLOSSARY_VI) {
      expect(e.en.trim().length).toBeGreaterThan(0);
      expect(e.vi.trim().length).toBeGreaterThan(0);
    }
  });

  it('includes the R271 domain additions (XRD / DFT / PEC)', () => {
    const block = glossaryBlock('vi');
    expect(block).toContain('X-ray diffraction → nhiễu xạ tia X');
    expect(block).toContain('density functional theory →');
    expect(block).toContain('water splitting → tách nước');
  });

  it('returns empty for non-vi targets (no glossary yet)', () => {
    expect(glossaryBlock('en')).toBe('');
    expect(glossaryBlock('ja')).toBe('');
  });
});
