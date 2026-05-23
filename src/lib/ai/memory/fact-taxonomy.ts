/**
 * Fact taxonomy (ADR-035 M2, L2) — controlled vocabulary for UserFact.subject.
 *
 * The extractor is constrained to these subjects so facts stay structured and
 * de-dupable. Free-form subjects would fragment ("research" vs "research_focus"
 * vs "what I study") and break supersede logic, which keys on subject equality.
 *
 * @phase R193-mem-m2
 */

export const FACT_SUBJECTS = [
  'user.research_focus', // e.g. "WO3 supercapacitors"
  'user.expertise_level', // e.g. "PhD materials science"
  'user.preferred_techniques', // e.g. ["XRD", "FTIR"]
  'user.preferred_solvent',
  'user.lab_equipment', // instruments the user works with
  'user.workflow_style', // e.g. "prefers step-by-step derivations"
  'user.material_systems', // materials the user studies
  'user.language_preference',
  'user.citation_style',
  'user.other' // catch-all; kept low priority for retrieval/cap
] as const;

export type FactSubject = (typeof FACT_SUBJECTS)[number];

export function isValidSubject(s: unknown): s is FactSubject {
  return typeof s === 'string' && (FACT_SUBJECTS as readonly string[]).includes(s);
}

/** Subjects that should never be auto-evicted by the cap (core identity). */
export const HIGH_VALUE_SUBJECTS: ReadonlySet<FactSubject> = new Set([
  'user.research_focus',
  'user.material_systems',
  'user.expertise_level'
]);
