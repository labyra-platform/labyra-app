import { describe, expect, it } from 'vitest';

import { buildCitationKey } from '@/lib/ai/tier4-writer/citation-key';
import { auditCitations } from '@/lib/ai/tier4-writer/grounding';

describe('auditCitations — deterministic citation grounding (R276)', () => {
  const valid = new Set(['smith2024', 'nguyen2023', 'li2022a']);

  it('passes citations that map to a retrieved source', () => {
    const r = auditCitations('As shown [smith2024] and [nguyen2023].', valid);
    expect(r.valid.toSorted()).toEqual(['nguyen2023', 'smith2024']);
    expect(r.invalid).toEqual([]);
  });

  it('flags a fabricated author-year citation not in the source set', () => {
    const r = auditCitations('Reported in [smith2024] but also [madeup2099].', valid);
    expect(r.invalid).toEqual(['madeup2099']);
    expect(r.valid).toEqual(['smith2024']);
  });

  it('flags a near-miss key (wrong year) as fabricated', () => {
    const r = auditCitations('Per [smith2023].', valid); // valid has smith2024, not 2023
    expect(r.invalid).toEqual(['smith2023']);
    expect(r.valid).toEqual([]);
  });

  it('distinguishes collision-suffixed keys', () => {
    const r = auditCitations('Both [li2022a] and [li2022b] agree.', valid);
    expect(r.valid).toEqual(['li2022a']);
    expect(r.invalid).toEqual(['li2022b']);
  });

  it('accepts an n.d. (no-date) key when it is a real source', () => {
    const r = auditCitations('Older work [tran nd-typo] aside, see [phamnd].', new Set(['phamnd']));
    expect(r.valid).toEqual(['phamnd']);
    expect(r.invalid).toEqual([]); // 'tran nd-typo' is not a citation shape → ignored
  });

  it('ignores numeric refs and non-citation brackets (no false positives)', () => {
    const r = auditCitations('See ref [12], table [A], and note [x].', valid);
    expect(r.valid).toEqual([]);
    expect(r.invalid).toEqual([]);
  });

  it('dedupes a repeated citation', () => {
    const r = auditCitations('[smith2024] ... later [smith2024] again.', valid);
    expect(r.valid).toEqual(['smith2024']);
  });
});

describe('buildCitationKey — never fabricates a year (R276 harden)', () => {
  it("uses 'nd' when the paper has no year (NOT the current year)", () => {
    const key = buildCitationKey({ paperId: 'p1', authors: ['Smith, J.'] }, new Set());
    expect(key).toBe('smithnd');
  });

  it('uses the real year when present', () => {
    const key = buildCitationKey({ paperId: 'p1', authors: ['Smith, J.'], year: 2019 }, new Set());
    expect(key).toBe('smith2019');
  });

  it('takes the family name first for Vietnamese authors', () => {
    const key = buildCitationKey(
      { paperId: 'p1', authors: ['Nguyễn Văn A'], year: 2021 },
      new Set()
    );
    expect(key).toBe('nguyen2021');
  });

  it('adds a/b suffix on collision', () => {
    const existing = new Set(['smith2019']);
    const key = buildCitationKey({ paperId: 'p2', authors: ['Smith, A.'], year: 2019 }, existing);
    expect(key).toBe('smith2019a');
  });
});
