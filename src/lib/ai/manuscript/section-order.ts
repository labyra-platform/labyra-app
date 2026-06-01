/**
 * IMRaD ordering + manuscript→writer section mapping for the generation
 * pipeline. Pure (no I/O) — unit-tested.
 *
 * @phase R-aiscience-2
 */
import type { ManuscriptSectionType } from '@/features/manuscript/types';
import type { SectionType } from '@/lib/ai/tier4-writer/types';

/**
 * Order sections are drafted in. Abstract appears first as a rough SEED that
 * frames the paper; the pipeline regenerates ("refines") it last once the body
 * exists. The other sections are drafted top-down so each sees the ones before.
 */
export const IMRAD_ORDER: readonly ManuscriptSectionType[] = [
  'abstract',
  'introduction',
  'materials',
  'methods',
  'results_discussion',
  'conclusion'
] as const;

/** The T4 Writer section used to draft a given manuscript section. */
export function manuscriptToWriterSection(
  type: ManuscriptSectionType
): Exclude<SectionType, 'auto'> {
  // Results & Discussion is one manuscript section; drafted with the
  // interpretive 'discussion' guidance (the instruction also asks for results).
  return type === 'results_discussion' ? 'discussion' : type;
}

/** Next section to draft given which manuscript sections already have content. */
export function nextSectionToDraft(
  doneTypes: ReadonlySet<ManuscriptSectionType>
): ManuscriptSectionType | null {
  for (const type of IMRAD_ORDER) {
    if (!doneTypes.has(type)) return type;
  }
  return null;
}
