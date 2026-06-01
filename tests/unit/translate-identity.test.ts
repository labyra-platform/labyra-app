import { describe, expect, it } from 'vitest';
import {
  detectLang,
  FRANC_TO_LANG,
  isSameLanguage
} from '@/features/papers/lib/translate-identity';

// Paragraph-sized samples — the realistic unit a user drags to translate.
const EN =
  'The hydrogen evolution reaction was studied using cyclic voltammetry in an alkaline electrolyte solution at room temperature. The overpotential decreased markedly after loading the catalyst onto the working electrode.';
const VI =
  'Phản ứng thoát hydro được nghiên cứu bằng phương pháp quét thế vòng trong dung dịch điện ly kiềm ở nhiệt độ phòng. Quá thế giảm rõ rệt sau khi phủ chất xúc tác lên điện cực làm việc.';

describe('detectLang', () => {
  it('detects English prose as "en"', () => {
    expect(detectLang(EN)).toBe('en');
  });

  it('detects Vietnamese prose as "vi"', () => {
    expect(detectLang(VI)).toBe('vi');
  });

  it('returns null for very short text (franc unreliable)', () => {
    expect(detectLang('NaOH')).toBeNull();
    expect(detectLang('H2O2')).toBeNull();
    expect(detectLang('')).toBeNull();
  });

  it('never forces a guess: result is always null or a mapped 2-letter code', () => {
    const codes = new Set(Object.values(FRANC_TO_LANG));
    for (const sample of [EN, VI, 'αβγ δεζ ηθι κλμ', 'lorem ipsum dolor sit amet consectetur']) {
      const out = detectLang(sample);
      expect(out === null || codes.has(out)).toBe(true);
    }
  });
});

describe('isSameLanguage — en→en short-circuit gate (API is skipped iff true)', () => {
  it('English text + target "en" → true (skip the model)', () => {
    expect(isSameLanguage(EN, 'en')).toBe(true);
  });

  it('Vietnamese text + target "vi" → true (skip the model)', () => {
    expect(isSameLanguage(VI, 'vi')).toBe(true);
  });

  it('English text + target "vi" → false (must translate)', () => {
    expect(isSameLanguage(EN, 'vi')).toBe(false);
  });

  it('Vietnamese text + target "en" → false (must translate)', () => {
    expect(isSameLanguage(VI, 'en')).toBe(false);
  });

  it('short text → false (no false short-circuit on unreliable detection)', () => {
    expect(isSameLanguage('NaOH', 'en')).toBe(false);
  });
});
