/**
 * Maps a Project's type to the manuscript template seeded when a draft is
 * created under that project (R267).
 *
 * The only lever the manuscript model exposes for "template" is
 * `pipelineSections` — which IMRaD sections are in the generation pipeline.
 * `undefined` (or empty) means full IMRaD, the model default. So:
 *   - course  → lab-report layout (no standalone abstract)
 *   - graduation / master / phd (thesis) and funded (grant) → full IMRaD
 *
 * Thesis and grant work currently share the full-IMRaD section set because the
 * model has a single 'imrad' journal profile; per-type journal profiles (e.g. a
 * grant-report or thesis-chapter SectionSpec) are a future extension and would
 * slot in here.
 *
 * Pure (no I/O). The user can still toggle sections in the manuscript canvas
 * after creation — this only seeds the initial set.
 */
import type { ManuscriptSectionType } from '@/features/manuscript/types';
import type { ProjectType } from '@/types/project';

export function pipelineSectionsForProjectType(
  type: ProjectType
): ManuscriptSectionType[] | undefined {
  if (type === 'course') {
    // Lab report: Introduction · Materials · Methods · Results & Discussion ·
    // Conclusion (no standalone abstract).
    return ['introduction', 'materials', 'methods', 'results_discussion', 'conclusion'];
  }
  // graduation / master / phd / funded → full IMRaD (model default).
  return undefined;
}
