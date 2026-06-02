/**
 * Pure Introduction-quality metrics (no I/O) for the baseline harness.
 *
 * Scores a generated Introduction against the keys the Writer was actually
 * given (the section's `citations[].citationKey`). The headline signal is
 * `fabricatedCitations` — `[key]` tokens in the prose that map to NO real
 * source (the R276 "invalid citation" definition, recomputed offline). Weak
 * retrieval shows up here directly. All other metrics are structural.
 *
 * Deterministic + dependency-free so it can be unit-checked and reused by the
 * offline eval script.
 *
 * @phase R-aiscience-intro-eval
 */

/** authorYear citation token, e.g. [smith2024], [nguyen2023a]. */
const CITE_RE = /\[([A-Za-z][A-Za-z0-9.-]*\d{4}[a-z]?)\]/g;

/** Rough sentence split (good enough for density ratios, not linguistics). */
function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(“"$])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function uniq(arr) {
  return [...new Set(arr)];
}

/**
 * @param {string} content    The generated Introduction text.
 * @param {string[]} validKeys Citation keys the Writer was given (section.citations).
 */
export function analyzeIntro(content, validKeys) {
  const text = (content ?? '').trim();
  const valid = new Set(validKeys ?? []);

  const citeTokens = [...text.matchAll(CITE_RE)].map((m) => m[1]);
  const citedUnique = uniq(citeTokens);
  const fabricated = citedUnique.filter((k) => !valid.has(k));
  const unusedSources = [...valid].filter((k) => !citedUnique.includes(k));

  const hasCite = (s) => /\[[A-Za-z][A-Za-z0-9.-]*\d{4}[a-z]?\]/.test(s); // non-global: stateless
  const sentences = splitSentences(text);
  const sentencesWithCite = sentences.filter(hasCite);
  // A "claim sentence" we treat as a non-trivial sentence (>= 8 words).
  const claimSentences = sentences.filter((s) => s.split(/\s+/).length >= 8);
  const claimsNoCite = claimSentences.filter((s) => !hasCite(s));

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lastPara = paragraphs[paragraphs.length - 1] ?? '';
  const objectivePivot =
    /\b(we|our|this work|this study|herein|here we|present|report|investigate|demonstrate|aim|objective)\b/i.test(
      lastPara
    );

  const words = text ? text.split(/\s+/).length : 0;

  return {
    words,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    citationOccurrences: citeTokens.length,
    uniqueCitedPapers: citedUnique.length,
    validSourcesGiven: valid.size,
    fabricatedCitations: fabricated.length,
    fabricatedKeys: fabricated,
    unusedSources: unusedSources.length,
    citedSourceRatio: valid.size ? +(citedUnique.filter((k) => valid.has(k)).length / valid.size).toFixed(2) : 0,
    sentenceCitationRatio: sentences.length ? +(sentencesWithCite.length / sentences.length).toFixed(2) : 0,
    claimSentences: claimSentences.length,
    claimsWithoutCitation: claimsNoCite.length,
    objectivePivot
  };
}
