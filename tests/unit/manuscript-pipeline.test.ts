import { describe, expect, it } from 'vitest';

import type {
  GlossaryTerm,
  ManuscriptSection,
  ManuscriptSectionType
} from '@/features/manuscript/types';
import { buildRunningContext } from '@/lib/ai/manuscript/running-memory';
import {
  IMRAD_ORDER,
  manuscriptToWriterSection,
  nextSectionToDraft
} from '@/lib/ai/manuscript/section-order';

function sec(type: ManuscriptSectionType, order: number, content: string): ManuscriptSection {
  return {
    type,
    order,
    content,
    status: 'draft',
    citations: [],
    linkedMeasurementIds: [],
    generatedByTier: 4,
    sectionVersion: 1
  };
}

describe('section-order (R-aiscience-2)', () => {
  it('maps Results & Discussion to the interpretive writer section', () => {
    expect(manuscriptToWriterSection('results_discussion')).toBe('discussion');
  });
  it('maps the other sections 1:1', () => {
    for (const s of ['abstract', 'introduction', 'materials', 'methods', 'conclusion'] as const) {
      expect(manuscriptToWriterSection(s)).toBe(s);
    }
  });
  it('nextSectionToDraft walks IMRaD order', () => {
    expect(nextSectionToDraft(new Set())).toBe('abstract');
    expect(nextSectionToDraft(new Set(['abstract', 'introduction']))).toBe('materials');
    expect(nextSectionToDraft(new Set(IMRAD_ORDER))).toBe(null);
  });
});

describe('buildRunningContext', () => {
  it('is empty with no prior content and no glossary', () => {
    expect(buildRunningContext([], [])).toBe('');
  });

  it('includes prior sections (sorted by order) and the glossary', () => {
    const a = sec('introduction', 1, 'Intro body.');
    const b = sec('methods', 3, 'Methods body.');
    const glossary: GlossaryTerm[] = [
      { term: 'h-WO₃', definition: 'hexagonal WO₃' },
      { term: 'PEC' }
    ];
    const ctx = buildRunningContext([b, a], glossary); // deliberately unsorted

    expect(ctx).toContain('Intro body.');
    expect(ctx).toContain('Methods body.');
    expect(ctx.indexOf('introduction')).toBeLessThan(ctx.indexOf('methods'));
    expect(ctx).toContain('h-WO₃ — hexagonal WO₃');
    expect(ctx).toContain('PEC');
  });

  it('skips sections whose content is blank', () => {
    expect(buildRunningContext([sec('abstract', 0, '   ')], [])).toBe('');
  });

  it('truncates long section content', () => {
    const long = 'x'.repeat(1000);
    const ctx = buildRunningContext([sec('introduction', 1, long)], []);
    expect(ctx).toContain('…');
    expect(ctx.length).toBeLessThan(long.length);
  });
});
