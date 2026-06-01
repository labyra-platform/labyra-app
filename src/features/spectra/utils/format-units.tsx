/**
 * formatSciText: convert plain ASCII scientific notation to pretty Unicode + JSX.
 * Worker outputs "cm-1", "sp2", "h2o" → render as cm⁻¹, sp², H₂O.
 * @phase R160-spectra-3c-hotfix
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '\u2212': '⁻',
  '+': '⁺'
};

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

function toSuperscript(s: string): string {
  return s
    .split('')
    .map((c) => SUPERSCRIPT_MAP[c] ?? c)
    .join('');
}

function toSubscript(s: string): string {
  return s
    .split('')
    .map((c) => SUBSCRIPT_MAP[c] ?? c)
    .join('');
}

/**
 * Format scientific text. Examples:
 * - "cm-1" → "cm⁻¹"
 * - "sp2 carbon" → "sp² carbon"
 * - "I_D/I_G" → "I_D/I_G" (kept literal, common in lab notation)
 * - "h2o" → "H₂O" only if explicitly a chemical formula context (skipped here)
 */
export function formatSciText(text: string): string {
  if (!text) return text;
  let out = text;
  // HTML from Crossref/JATS titles (e.g. "TiO<sub>2</sub>", "g-C<sub>3</sub>N<sub>4</sub>",
  // "cm<sup>-2</sup>"): decode entities, convert sub/sup tags to Unicode, strip the rest.
  out = out
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/<sub>(.*?)<\/sub>/gi, (_m, s) => toSubscript(s));
  out = out.replace(/<sup>(.*?)<\/sup>/gi, (_m, s) => toSuperscript(s));
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, ''); // strip remaining tags (<i>, <b>, <em>…)
  // Chemical formula subscript: H2O → H₂O, W18O49 → W₁₈O₄₉, CO2 → CO₂
  // Match: Capital letter (+ optional lowercase) followed by digits
  // Skip if surrounded by space-digit patterns that look like coordinates/measurements
  out = out.replace(/([A-Z][a-z]?)(\d+)/g, (match, element, count) => {
    // Skip long digit runs — identifiers/codes (e.g. "S40820-..."), not formula
    // counts. Real chemical subscripts are ≤3 digits (W18O49). @R259
    if (count.length > 3) return match;
    // Skip known unit prefixes that shouldn't be subscripted
    if (
      ['CO', 'NM', 'KM', 'MM', 'KG', 'MG', 'HZ', 'EV', 'PH'].includes(element.toUpperCase()) &&
      match.length > 3
    ) {
      // These could be units; check context (skip for now if uppercase only)
    }
    return `${element}${toSubscript(count)}`;
  });
  // Pattern: unit-N or unit+N (e.g. cm-1, m-2, s-1) → superscript exponent
  out = out.replace(
    /(\bcm|nm|um|mm|km|s|m|Hz|kg|g|mg|J|eV|K|mol|L|N)([+\-\u2212]?\d+)/g,
    (_m, unit, exp) => {
      return `${unit}${toSuperscript(exp)}`;
    }
  );
  // sp2, sp3 → sp², sp³ (only when followed by space or word boundary)
  out = out.replace(/\bsp([23])\b/g, (_m, n) => `sp${toSuperscript(n)}`);
  // Common scientific notation: ×10-3, x10-3 → ×10⁻³
  out = out.replace(/(?:×|x)10([+-]?\d+)/g, (_m, exp) => `×10${toSuperscript(exp)}`);
  // Lambda symbol normalization
  out = out.replace(/\blambda\b/gi, 'λ');
  out = out.replace(/\b2theta\b/gi, '2θ');
  out = out.replace(/\btheta\b/gi, 'θ');
  out = out.replace(/\bnu\b/g, 'ν');
  out = out.replace(/\balpha\b/gi, 'α');
  out = out.replace(/\bbeta\b/gi, 'β');
  return out;
}

/**
 * React component wrapper. Use as <SciText>cm-1</SciText> → cm⁻¹.
 */
export function SciText({ children }: { children: string }) {
  return <>{formatSciText(children)}</>;
}

/**
 * Like formatSciText but renders real <sub>/<sup> elements (React nodes) instead
 * of Unicode. Use for TITLES so chemical formulae with LETTERS in sub/superscript
 * (e.g. WO3-x → WO₃₋ₓ, Ni1-x, vacancy notation) render correctly — Unicode only
 * covers digits + a few chars. Handles Crossref/JATS HTML (<sub>/<sup>/entities)
 * and ASCII patterns (H2O, cm-1, sp2). Returns a string when there's nothing to
 * mark up. Keep formatSciText (string) for copy/search/non-JSX contexts.
 *
 * @phase R237cf
 */
export function formatSciNode(text: string): React.ReactNode {
  if (!text) return text;
  let s = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
  // Strip non sub/sup tags (<i>, <b>, <em>…), keep <sub>/<sup>.
  s = s.replace(/<(?!\/?su[bp]\b)[^>]*>/gi, '');
  // Greek/symbol normalization (string-level).
  s = s
    .replace(/\blambda\b/gi, 'λ')
    .replace(/\b2theta\b/gi, '2θ')
    .replace(/\btheta\b/gi, 'θ')
    .replace(/\bnu\b/g, 'ν')
    .replace(/\balpha\b/gi, 'α')
    .replace(/\bbeta\b/gi, 'β');
  // Normalize ASCII sci patterns to tags so everything is tag-based.
  // Subscript only short digit runs (≤3) — real formula counts are tiny (W18O49);
  // long runs are identifiers/codes (e.g. "S40820-026-...") that must stay literal. @R259
  s = s.replace(/([A-Za-z)\]])(\d+)/g, (match, prefix: string, digits: string) =>
    digits.length <= 3 ? `${prefix}<sub>${digits}</sub>` : match
  ); // H2O → H<sub>2</sub>
  s = s.replace(
    /(\bcm|nm|um|mm|km|s|m|Hz|kg|g|mg|J|eV|K|mol|L|N)([+\-\u2212]\d+)/g,
    '$1<sup>$2</sup>'
  ); // cm-1 → cm<sup>-1</sup> (only signed exponents, to avoid eating subscripts)
  s = s.replace(/\bsp<sub>([23])<\/sub>/g, 'sp<sup>$1</sup>'); // sp2 → sp²
  // Tokenize <sub>/<sup> into React nodes; plain text stays as strings.
  const parts: React.ReactNode[] = [];
  const re = /<(sub|sup)>([^<]*)<\/(?:sub|sup)>/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const Tag = m[1] as 'sub' | 'sup';
    parts.push(<Tag key={key}>{m[2]}</Tag>);
    key += 1;
    last = re.lastIndex;
    m = re.exec(s);
  }
  if (last < s.length) parts.push(s.slice(last));
  if (parts.length === 0) return s;
  return parts.length === 1 ? parts[0] : parts;
}
