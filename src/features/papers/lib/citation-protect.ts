/**
 * Citation / cross-reference protection for translation (ADR-045, Tier 1a).
 *
 * Problem: asking the model to "keep [20] / Figure 4 unchanged" (prompt-based)
 * isn't reliable — it sometimes localizes the number, breaks a range, or
 * translates "Figure 4" inconsistently. Researchers rely on these as lookup
 * anchors, so any drift loses source tracking.
 *
 * Fix: mask refs with an opaque placeholder BEFORE the model sees them, then
 * restore AFTER. The model can't corrupt what it never sees. On restore we can
 * also localize the *leading word* of a reference (Figure→Hình, Eq→phương
 * trình, Table→Bảng, Section→Mục) while keeping the number verbatim.
 *
 * Placeholder = ⟦Cn⟧ (U+27E6/27E7 mathematical white square brackets) — almost
 * never appears in prose, so the model passes it through; the restore regex is
 * also tolerant of stray spaces the model may add (⟦ C1 ⟧).
 *
 * Scope: bracket numerics + Figure/Table/Equation/Section refs (Tier 1a), plus
 * author-year citations, DOIs, arXiv ids and bare URLs (Tier 1b). Author-year,
 * DOI, arXiv and URL are restored verbatim (never localized); Figure/Table/etc.
 * get their leading word localized for vi while keeping the number.
 *
 * Pure (no I/O), so it runs inline in the translate route — no worker needed.
 */

export type RefKind =
  | 'bracket'
  | 'figure'
  | 'table'
  | 'equation'
  | 'section'
  | 'authoryear'
  | 'doi'
  | 'arxiv'
  | 'url'
  | 'formula';

export interface RefEntry {
  kind: RefKind;
  /** The exact source text that was masked (used for non-vi restore). */
  raw: string;
  /** The reference number, when the pattern has one (e.g. "4", "S2", "3.2"). */
  num?: string;
}

export interface ProtectResult {
  masked: string;
  map: RefEntry[];
}

// Order matters: greedy/containing patterns first (a URL may contain a DOI; a
// DOI/year shouldn't be split). Each runs over the text already masked by
// earlier patterns; placeholders (⟦Cn⟧) never match these regexes, so it's safe.
const PATTERNS: { kind: RefKind; re: RegExp; numGroup?: number }[] = [
  // https://… (stop before whitespace or a closing paren so "(see https://x)"
  // doesn't swallow the ")").
  { kind: 'url', re: /https?:\/\/[^\s)]+/g },
  // DOI: 10.1234/abcd…  (standalone; URLs above are already masked)
  { kind: 'doi', re: /\b10\.\d{4,9}\/[^\s)]+/g },
  // arXiv:2605.20025  ·  arXiv: 2605.20025v2
  { kind: 'arxiv', re: /\barXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?/gi },
  // [23] [1-3] [20,25] [29–31]
  { kind: 'bracket', re: /\[\d+(?:\s*[-–,]\s*\d+)*\]/g },
  // Author-year: (Smith, 2023) · (Smith et al., 2023) · (Smith and Lee, 2020) ·
  // (Smith et al., 2023; Lee, 2021). Requires a Capitalized author token AND a
  // 4-digit year, so "(Fig. 4)" / "(in 2023)" are NOT matched.
  {
    kind: 'authoryear',
    re: /\([A-Z][A-Za-z'`-]+(?:\s+et\s+al\.?|\s+(?:and|&)\s+[A-Z][A-Za-z'`-]+)?,?\s+\d{4}[a-z]?(?:\s*;\s*[A-Z][A-Za-z'`-]+(?:\s+et\s+al\.?|\s+(?:and|&)\s+[A-Z][A-Za-z'`-]+)?,?\s+\d{4}[a-z]?)*\)/g
  },
  // Figure 4 · Fig. 4 · Fig 4 · Fig. S2 · Figure 4a   (NOT "configure 4": \b)
  { kind: 'figure', re: /\b(?:Figures?|Figs?)\.?\s+(S?\d+[a-z]?)\b/gi, numGroup: 1 },
  // Table 1 · Tab. 1 · Table S3
  { kind: 'table', re: /\b(?:Tables?|Tabs?)\.?\s+(S?\d+[a-z]?)\b/gi, numGroup: 1 },
  // Eq. 5 · eq 2 · Equation 2 · Eq. (5)
  { kind: 'equation', re: /\b(?:Equations?|Eqs?)\.?\s+\(?(\d+[a-z]?)\)?/gi, numGroup: 1 },
  // Section 3.2 · Sec. 3
  { kind: 'section', re: /\b(?:Sections?|Secs?)\.?\s+(\d+(?:\.\d+)*)\b/gi, numGroup: 1 }
];

const PLACEHOLDER_OPEN = '\u27E6C'; // ⟦C
const PLACEHOLDER_CLOSE = '\u27E7'; // ⟧

// R270: chemical-formula protection. Materials-science prose is dense with
// formulae (H2O, WO3, MoS2, Fe2O3) that the model otherwise breaks (subscript
// split, "H 2 O") or transliterates. We mask any whole-word token that parses
// ENTIRELY into periodic-table element symbols AND looks chemical (≥2 element
// groups OR a digit) — so ordinary words that happen to be element symbols
// ("In", "As", "He", "No", "Be") are left untouched. Restored verbatim.
const ELEMENTS = new Set([
  'H',
  'He',
  'Li',
  'Be',
  'B',
  'C',
  'N',
  'O',
  'F',
  'Ne',
  'Na',
  'Mg',
  'Al',
  'Si',
  'P',
  'S',
  'Cl',
  'Ar',
  'K',
  'Ca',
  'Sc',
  'Ti',
  'V',
  'Cr',
  'Mn',
  'Fe',
  'Co',
  'Ni',
  'Cu',
  'Zn',
  'Ga',
  'Ge',
  'As',
  'Se',
  'Br',
  'Kr',
  'Rb',
  'Sr',
  'Y',
  'Zr',
  'Nb',
  'Mo',
  'Tc',
  'Ru',
  'Rh',
  'Pd',
  'Ag',
  'Cd',
  'In',
  'Sn',
  'Sb',
  'Te',
  'I',
  'Xe',
  'Cs',
  'Ba',
  'La',
  'Ce',
  'Pr',
  'Nd',
  'Pm',
  'Sm',
  'Eu',
  'Gd',
  'Tb',
  'Dy',
  'Ho',
  'Er',
  'Tm',
  'Yb',
  'Lu',
  'Hf',
  'Ta',
  'W',
  'Re',
  'Os',
  'Ir',
  'Pt',
  'Au',
  'Hg',
  'Tl',
  'Pb',
  'Bi',
  'Po',
  'At',
  'Rn',
  'Fr',
  'Ra',
  'Ac',
  'Th',
  'Pa',
  'U',
  'Np',
  'Pu',
  'Am',
  'Cm',
  'Bk',
  'Cf',
  'Es',
  'Fm',
  'Md',
  'No',
  'Lr',
  'Rf',
  'Db',
  'Sg',
  'Bh',
  'Hs',
  'Mt',
  'Ds',
  'Rg',
  'Cn',
  'Nh',
  'Fl',
  'Mc',
  'Lv',
  'Ts',
  'Og'
]);

// Whole-word run of element-like groups (Capital + optional lowercase + digits).
// The \b…\b bounds mean formula-like fragments inside real words (e.g. the "Fi"
// in "Figure") never match — the trailing letter breaks the word boundary.
const FORMULA_CANDIDATE_RE = /\b(?:[A-Z][a-z]?\d*)+\b/g;

/** True when `token` is a plausible chemical formula: every element symbol is
 *  real AND it has ≥2 element groups or at least one subscript digit. */
function isChemicalFormula(token: string): boolean {
  const groups = token.match(/[A-Z][a-z]?\d*/g);
  if (!groups) return false;
  let hasDigit = false;
  for (const g of groups) {
    const m = /^([A-Z][a-z]?)(\d*)$/.exec(g);
    if (!m || !ELEMENTS.has(m[1] as string)) return false;
    if (m[2]) hasDigit = true;
  }
  return groups.length >= 2 || hasDigit;
}

/** Replace refs with ⟦Cn⟧ placeholders. Returns the masked text + an ordered
 *  map for {@link restoreRefs}. */
export function protectRefs(text: string): ProtectResult {
  const map: RefEntry[] = [];
  let out = text;
  // R270: chemical formulae FIRST — before any ⟦Cn⟧ placeholders exist, so the
  // formula scanner can't accidentally re-match the "C<n>" inside a placeholder,
  // and the later ref patterns never see (or split) a formula token.
  out = out.replace(FORMULA_CANDIDATE_RE, (m) => {
    if (!isChemicalFormula(m)) return m;
    const idx = map.length;
    map.push({ kind: 'formula', raw: m });
    return `${PLACEHOLDER_OPEN}${idx}${PLACEHOLDER_CLOSE}`;
  });
  for (const { kind, re, numGroup } of PATTERNS) {
    out = out.replace(re, (m, ...groups) => {
      const idx = map.length;
      const num = numGroup ? (groups[numGroup - 1] as string | undefined) : undefined;
      map.push({ kind, raw: m, num });
      return `${PLACEHOLDER_OPEN}${idx}${PLACEHOLDER_CLOSE}`;
    });
  }
  return { masked: out, map };
}

/** Leading-word translations for localized restore. The NUMBER is always kept. */
const LABEL_BY_LANG: Record<string, Partial<Record<RefKind, string>>> = {
  vi: { figure: 'Hình', table: 'Bảng', equation: 'phương trình', section: 'Mục' }
};

/** Restore ⟦Cn⟧ placeholders. For vi, localizes the leading word of
 *  figure/table/equation/section refs (keeping the number); everything else is
 *  restored to its original source text. Tolerant of spaces the model may have
 *  inserted inside the placeholder. */
/**
 * Render stoichiometric subscripts for a masked chemical formula on restore.
 * Only MULTI-element formulae (≥2 element groups) get <sub> — their digits are
 * unambiguously stoichiometric (WO3→WO<sub>3</sub>, Fe2O3). Single-element +
 * digit is left verbatim: "O2" (diatomic, subscript) is indistinguishable from
 * "U235" (isotope mass number = SUPERSCRIPT), so we never risk mis-formatting.
 * Output is consumed as HTML (sanitizeFormatting whitelists <sub>).
 */
function formatFormulaSubscripts(raw: string): string {
  const groups = raw.match(/[A-Z][a-z]?\d*/g);
  if (!groups || groups.length < 2) return raw;
  return raw.replace(/(\d+)/g, '<sub>$1</sub>');
}

export function restoreRefs(text: string, map: RefEntry[], lang: string): string {
  const labels = LABEL_BY_LANG[lang];
  return text.replace(/\u27E6\s*C(\d+)\s*\u27E7/g, (_m, i: string) => {
    const entry = map[Number(i)];
    if (!entry) return ''; // orphaned placeholder (model dropped the ref) — drop it
    const label = labels?.[entry.kind];
    if (label && entry.num) return `${label} ${entry.num}`;
    if (entry.kind === 'formula') return formatFormulaSubscripts(entry.raw);
    return entry.raw;
  });
}
