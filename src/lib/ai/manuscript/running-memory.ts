/**
 * Running memory for manuscript coherence. Pure (no I/O, no LLM) — unit-tested.
 *
 * Builds the "prior context" block fed to the writer when drafting a section:
 * a truncated summary of already-written sections + the glossary of key terms.
 * Heuristic-only (token-cheap, deterministic) — each prior section is truncated
 * rather than re-fed whole, so terminology and claims carry forward without
 * blowing the context budget or adding an extra LLM call.
 *
 * @phase R-aiscience-2
 */
import type { GlossaryTerm, ManuscriptSection } from '@/features/manuscript/types';

const SUMMARY_CHARS_PER_SECTION = 400;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

export function buildRunningContext(
  priorSections: ManuscriptSection[],
  glossary: GlossaryTerm[]
): string {
  const parts: string[] = [];

  const drafted = priorSections
    .filter((s) => s.content.trim().length > 0)
    .toSorted((a, b) => a.order - b.order);
  if (drafted.length > 0) {
    const blocks = drafted.map(
      (s) => `### ${s.type}\n${truncate(s.content, SUMMARY_CHARS_PER_SECTION)}`
    );
    parts.push(
      `## Already-written sections (for consistency — do NOT repeat their content)\n${blocks.join('\n\n')}`
    );
  }

  if (glossary.length > 0) {
    const terms = glossary
      .map((g) => (g.definition ? `${g.term} — ${g.definition}` : g.term))
      .join('; ');
    parts.push(`## Key terms (use consistently, do not redefine)\n${terms}`);
  }

  return parts.join('\n\n');
}
