/**
 * Extract numerical values from chunk texts.
 * Builds a whitelist of numbers AI is "allowed" to cite.
 * @phase R160-ai-5e-1
 */

export interface NumberMatch {
  value: number;
  raw: string; // original string e.g. "27.3%", "2.5 eV"
  context: string; // ~30 chars surrounding
}

/**
 * Extract all numeric tokens from text. Includes:
 * - Plain numbers: 42, 3.14, 0.001
 * - With units: 2.5 eV, 100 mA/cm², 145 °C
 * - Percentages: 27%, 50.5%
 * - Scientific notation: 1.5e-3, 6.02e23
 * - Years: 2024, 1998
 */
const NUMBER_REGEX =
  /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?:\s*[%]|\s*[a-zA-Z°µ]+(?:[\/·][a-zA-Z²³]+)*)?/g;

export function extractNumbers(text: string): NumberMatch[] {
  const matches: NumberMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = NUMBER_REGEX.exec(text)) !== null) {
    const raw = match[0];
    // Extract just the numeric portion for the value
    const numMatch = raw.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!numMatch) continue;
    const value = parseFloat(numMatch[0]);
    if (!Number.isFinite(value)) continue;

    const start = Math.max(0, match.index - 15);
    const end = Math.min(text.length, match.index + raw.length + 15);
    matches.push({
      value,
      raw,
      context: text.slice(start, end)
    });
  }
  return matches;
}

/**
 * Build whitelist of numeric values from chunk texts.
 * Returns set of normalized number strings (with 2-decimal rounding for fuzzy match).
 */
export function buildNumberWhitelist(chunkTexts: string[]): Set<string> {
  const whitelist = new Set<string>();
  for (const text of chunkTexts) {
    const numbers = extractNumbers(text);
    for (const n of numbers) {
      whitelist.add(normalizeNumber(n.value));
    }
  }
  // Always-allowed numbers (common references, percentages)
  for (const n of [0, 1, 2, 5, 10, 25, 50, 75, 90, 95, 99, 100]) {
    whitelist.add(normalizeNumber(n));
  }
  return whitelist;
}

/**
 * Round number to 2 decimal places, return as string for set keys.
 */
function normalizeNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

/**
 * Check whether AI response contains numbers not in whitelist.
 */
const NEGATION_TOKENS = ['không', 'chưa', 'no', 'not', 'never', 'absent', 'lacking', 'without'];

function isInNegationContext(responseText: string, position: number): boolean {
  const lookbackStart = Math.max(0, position - 80);
  const before = responseText.slice(lookbackStart, position).toLowerCase();
  for (const neg of NEGATION_TOKENS) {
    const re = new RegExp('\\b' + neg + '\\b', 'i');
    if (re.test(before)) {
      const lastNegIdx = before.toLowerCase().lastIndexOf(neg);
      if (lastNegIdx >= 0) {
        const distance = before.length - lastNegIdx;
        if (distance <= 50) return true;
      }
    }
  }
  return false;
}

/**
 * Check whether AI response contains numbers not in whitelist.
 * Skips: page numbers (large ints), years (with corpus match), negated context.
 */
export function findUnverifiedNumbers(responseText: string, whitelist: Set<string>): NumberMatch[] {
  const responseNumbers = extractNumbers(responseText);
  const unverified: NumberMatch[] = [];
  let searchStart = 0;
  for (const n of responseNumbers) {
    const norm = normalizeNumber(n.value);
    if (whitelist.has(norm)) continue;

    // Skip large integers (>10000, no unit suffix) — page numbers, DOIs
    if (
      Number.isInteger(n.value) &&
      Math.abs(n.value) > 10000 &&
      !/[%a-zA-Z\u00B0\u00B5]/.test(n.raw)
    ) {
      continue;
    }

    // Years: allow if corpus has nearby year
    if (n.value >= 1900 && n.value <= 2100 && Number.isInteger(n.value)) {
      let yearMatch = false;
      for (let y = n.value - 5; y <= n.value + 5; y++) {
        if (whitelist.has(y.toString())) {
          yearMatch = true;
          break;
        }
      }
      if (yearMatch) continue;
    }

    // Negation context check
    const idx = responseText.indexOf(n.raw, searchStart);
    if (idx !== -1) {
      searchStart = idx + n.raw.length;
      if (isInNegationContext(responseText, idx)) {
        continue;
      }
    }

    unverified.push(n);
  }
  return unverified;
}
