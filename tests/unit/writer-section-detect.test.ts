import { describe, expect, it } from 'vitest';

import { buildWriterSystemPrompt, detectSection } from '@/lib/ai/tier4-writer/prompts';

describe('detectSection — full IMRaD (R-aiscience-1)', () => {
  it('detects the new sections', () => {
    expect(detectSection('Write the abstract for this paper')).toBe('abstract');
    expect(detectSection('Soạn phần tóm tắt')).toBe('abstract');
    expect(detectSection('List the reagents and precursors used')).toBe('materials');
    expect(detectSection('Draft the conclusion')).toBe('conclusion');
    expect(detectSection('viết kết luận')).toBe('conclusion');
  });

  it('still detects the original sections', () => {
    expect(detectSection('describe the synthesis procedure')).toBe('methods');
    expect(detectSection('present the XRD results')).toBe('results');
    expect(detectSection('discuss the mechanism')).toBe('discussion');
    expect(detectSection('write the introduction and background')).toBe('introduction');
  });

  it('prefers methods for a combined "materials and methods" request', () => {
    expect(detectSection('write the materials and methods section')).toBe('methods');
  });

  it('falls back to discussion when ambiguous', () => {
    expect(detectSection('help me with this paper')).toBe('discussion');
  });
});

describe('buildWriterSystemPrompt — guidance exists for every IMRaD section', () => {
  it('returns non-empty, section-specific guidance for the new sections', () => {
    for (const s of ['abstract', 'materials', 'conclusion'] as const) {
      const prompt = buildWriterSystemPrompt(s);
      expect(prompt.toUpperCase()).toContain(s.toUpperCase());
      expect(prompt.length).toBeGreaterThan(100);
    }
  });
});
