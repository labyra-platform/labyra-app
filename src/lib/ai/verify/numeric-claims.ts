/**
 * Tier-1 answer verification (R416): for a grounded scientific answer, check that
 * every numeric/measured value the model states (2.8 eV, 500 °C, 1.23 V, cm⁻¹ …)
 * actually appears in the chunk it cited. A fabricated number is caught
 * deterministically — no NLI, no second model call, no dependence on the (churny)
 * LLM layer. This is "correctness" for the claim type that matters most in
 * materials science, where a wrong band gap or synthesis temperature is real harm.
 *
 * Deliberately conservative: a value not found is flagged 'unverified' (worth a
 * glance), never silently trusted. Prose claims are out of scope here — they need
 * NLI/LLM-judge (Tier 2/3), a later round.
 */

export interface NumericClaim {
  /** The citation number [n] the value was attributed to. */
  citation: number;
  /** The value as written, e.g. "2.8 eV". */
  value: string;
  /** verified: value found in cited chunk. contradicted: the SAME unit appears in
   *  the chunk with a DIFFERENT value (the model likely mis-stated it — worse than
   *  merely unsourced). unverified: value simply not present. */
  status: 'verified' | 'unverified' | 'contradicted';
}

export interface NumericVerification {
  claims: NumericClaim[];
  verified: number;
  contradicted: number;
  total: number;
}

// Common materials-science units. Extend as gaps appear — order longer forms
// first so "mA/cm2" wins over "A" and "mA".
const UNIT = String.raw`(?:mA\s*\/?\s*cm\s*[-−^]?\s*2|mA\s*cm\s*[-−^]?\s*2|meV|keV|eV|kV|mV|V|nm|µm|μm|um|mm|cm⁻¹|cm-1|cm|Å|°C|℃|K|µA|μA|mA|A|wt\.?\s*%|at\.?\s*%|nM|mM|µM|μM|mol|M|kg|mg|g|hrs?|h|min|ms|s|kHz|MHz|GHz|Hz|GPa|MPa|kPa|Pa|Ω|ohm|S\s*\/\s*cm|kJ\s*\/\s*mol|J\s*\/\s*mol|rpm|kW|mW|W|°|%)`;
const NUM = String.raw`[-+]?\d+(?:[.,]\d+)?(?:\s*[×x]\s*10\s*[\^\-−]?\s*\d+)?`;
const VALUE_UNIT = new RegExp(String.raw`(${NUM})\s*(${UNIT})`, 'giu');

/** Collapse spacing + unify micro sign / degree so "2.8 eV" and "2.8eV" match. */
function normalize(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/℃/g, '°c')
    .replace(/⁻¹/g, '-1')
    .replace(/[×x]/g, 'x')
    .replace(/,/g, '.')
    .toLowerCase();
}

/**
 * @param answer  raw answer text (citations still as [n])
 * @param sources cited chunks, index i → citation [i+1]
 */
export function verifyNumericClaims(
  answer: string,
  sources: { text: string }[]
): NumericVerification {
  const normSources = sources.map((s) => normalize(s.text));
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  for (const sentence of answer.split(/(?<=[.!?])\s+/)) {
    const cites = [...sentence.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
    if (cites.length === 0) continue;
    for (const tok of sentence.matchAll(VALUE_UNIT)) {
      const value = `${tok[1].trim()} ${tok[2].replace(/\s+/g, ' ').trim()}`;
      const key = `${cites[0]}::${normalize(value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const normTok = normalize(value);
      const claimValNorm = normalize(tok[1]);
      const claimUnitNorm = normalize(tok[2]);
      let verified = false;
      let contradicted = false;
      for (const n of cites) {
        const src = normSources[n - 1];
        if (typeof src !== 'string') continue;
        if (src.includes(normTok)) {
          verified = true;
          break;
        }
        // Same unit, different value in the cited chunk → the model mis-stated it.
        const raw = sources[n - 1]?.text ?? '';
        for (const st of raw.matchAll(VALUE_UNIT)) {
          if (normalize(st[2]) === claimUnitNorm && normalize(st[1]) !== claimValNorm) {
            contradicted = true;
          }
        }
      }
      const status = verified ? 'verified' : contradicted ? 'contradicted' : 'unverified';
      claims.push({ citation: cites[0], value, status });
    }
  }

  return {
    claims,
    verified: claims.filter((c) => c.status === 'verified').length,
    contradicted: claims.filter((c) => c.status === 'contradicted').length,
    total: claims.length
  };
}
