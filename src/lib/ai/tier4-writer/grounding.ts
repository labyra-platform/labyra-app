/**
 * Deterministic citation grounding for T4 Writer. Pure + golden-case unit-tested.
 *
 * The trust guarantee: an author-year-shaped citation the model emits that does
 * NOT map to a retrieved source is *structurally* flagged — no LLM judgment, so
 * a fabricated [author2099] cannot slip through. This is what lets Labyra
 * promise grounded citations instead of probabilistically hoping for them.
 * (Numeric grounding — fabricated stats — is handled by checkGrounding in
 * @/lib/ai/grounding.)
 *
 * @phase R276
 */

// surname + (4-digit year | 'nd') + optional collision suffix — exactly the
// shape buildCitationKey() emits and the format the writer prompt instructs.
// Numeric refs ([12]) and non-citation brackets do not match, so they are
// neither counted nor falsely flagged.
const CITATION_KEY_RE = /\[([a-z]+(?:\d{4}|nd)[a-z]?)\]/gi;

export interface CitationAudit {
  /** Distinct citation keys in the draft that map to a retrieved source. */
  valid: string[];
  /** Distinct citation keys in the draft with NO matching source — fabricated. */
  invalid: string[];
}

/**
 * Classify every author-year citation in the draft against the valid key set
 * (the keys built from the papers actually retrieved for this draft).
 */
export function auditCitations(draft: string, validKeys: Set<string>): CitationAudit {
  const valid = new Set<string>();
  const invalid = new Set<string>();
  const re = new RegExp(CITATION_KEY_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(draft)) !== null) {
    const key = m[1].toLowerCase();
    (validKeys.has(key) ? valid : invalid).add(key);
  }
  return { valid: [...valid], invalid: [...invalid] };
}
