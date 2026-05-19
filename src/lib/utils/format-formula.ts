/**
 * Format chemical formula with Unicode subscript digits.
 *
 * Examples:
 *   MoS2 → MoS₂
 *   WO3 → WO₃
 *   Fe2O3 → Fe₂O₃
 *   CH3NH3PbI3 → CH₃NH₃PbI₃
 *   H2SO4 → H₂SO₄
 *
 * Rule: digits immediately following a letter or closing paren become subscript.
 * Standalone digits (e.g. coefficient "2 H2O") are left alone.
 *
 * @phase R183-3-hotfix1-ui-ux
 */

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉'
};

/**
 * Convert digits in chemical formula to Unicode subscript.
 * Only converts digits that come AFTER a letter or closing parenthesis.
 */
export function formatFormula(formula: string): string {
  if (!formula) return '';
  return formula.replace(/([A-Za-z)\]])([0-9]+)/g, (_match, prefix, digits) => {
    const subscripted = digits
      .split('')
      .map((d: string) => SUBSCRIPT_MAP[d] ?? d)
      .join('');
    return prefix + subscripted;
  });
}

/**
 * Reverse: subscript → ASCII digits (for search/query normalization).
 */
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SUBSCRIPT_MAP).map(([k, v]) => [v, k])
);

export function unformatFormula(text: string): string {
  if (!text) return '';
  return text.replace(/[₀-₉]/g, (ch) => REVERSE_MAP[ch] ?? ch);
}
