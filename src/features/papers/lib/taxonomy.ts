/**
 * Taxonomy v1 — paper domain classification (R178-3).
 *
 * Mirrors worker src/papers/_taxonomy.py. 36 categories across 4 axes.
 *
 * @phase R178-3
 * @r178-3-applied
 */

export const TAXONOMY_VERSION = 'v1' as const;

export const APPLICATION_SLUGS = [
  'photocatalysis',
  'electrocatalysis_her',
  'electrocatalysis_oer',
  'solar_cells',
  'batteries_li_ion',
  'batteries_beyond_li',
  'supercapacitors',
  'sensors_gas',
  'sensors_bio',
  'water_treatment',
  'co2_reduction',
  'hydrogen_storage',
  'thermoelectrics'
] as const;
export type ApplicationSlug = (typeof APPLICATION_SLUGS)[number];

export const MATERIALS_CLASS_SLUGS = [
  'metal_oxides',
  'sulfides_selenides',
  'mxenes',
  'perovskites',
  'two_d_materials',
  'mofs_cofs',
  'carbon_nanomaterials',
  'polymers_composites',
  'alloys_intermetallics'
] as const;
export type MaterialsClassSlug = (typeof MATERIALS_CLASS_SLUGS)[number];

export const SYNTHESIS_SLUGS = [
  'hydrothermal_solvothermal',
  'sol_gel',
  'cvd_pvd',
  'electrochemical_deposition',
  'mechanochemical',
  'green_synthesis'
] as const;
export type SynthesisSlug = (typeof SYNTHESIS_SLUGS)[number];

export const CHARACTERIZATION_SLUGS = [
  'xrd_focused',
  'spectroscopy_focused',
  'microscopy_focused',
  'electrochemistry_focused',
  'dft_computational'
] as const;
export type CharacterizationSlug = (typeof CHARACTERIZATION_SLUGS)[number];

export const META_SLUGS = ['review_article', 'perspective', 'unknown'] as const;
export type MetaSlug = (typeof META_SLUGS)[number];

export const PRIMARY_DOMAINS: ReadonlyArray<string> = [
  ...APPLICATION_SLUGS,
  ...MATERIALS_CLASS_SLUGS,
  ...META_SLUGS
];
export const SUBTOPIC_DOMAINS: ReadonlyArray<string> = [
  ...MATERIALS_CLASS_SLUGS,
  ...SYNTHESIS_SLUGS,
  ...CHARACTERIZATION_SLUGS
];
export const ALL_SLUGS: ReadonlyArray<string> = [
  ...new Set([...PRIMARY_DOMAINS, ...SUBTOPIC_DOMAINS])
];

export type DomainSlug = (typeof ALL_SLUGS)[number];
export type DomainConfidence = 'high' | 'medium' | 'low';

export type DomainAxis =
  | 'application'
  | 'materials_class'
  | 'synthesis'
  | 'characterization'
  | 'meta';

export function getAxis(slug: string): DomainAxis | null {
  if ((APPLICATION_SLUGS as ReadonlyArray<string>).includes(slug)) return 'application';
  if ((MATERIALS_CLASS_SLUGS as ReadonlyArray<string>).includes(slug)) return 'materials_class';
  if ((SYNTHESIS_SLUGS as ReadonlyArray<string>).includes(slug)) return 'synthesis';
  if ((CHARACTERIZATION_SLUGS as ReadonlyArray<string>).includes(slug)) return 'characterization';
  if ((META_SLUGS as ReadonlyArray<string>).includes(slug)) return 'meta';
  return null;
}

export function isPrimaryDomain(slug: string): boolean {
  return PRIMARY_DOMAINS.includes(slug);
}

export function isSubtopic(slug: string): boolean {
  return SUBTOPIC_DOMAINS.includes(slug);
}

export function domainI18nKey(slug: string): string {
  return `domain.${slug}`;
}

/** Color tokens per axis (semantic + WCAG AA contrast) */
export const AXIS_COLOR: Record<DomainAxis, string> = {
  application: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/40',
  materials_class: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/40',
  synthesis: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40',
  characterization:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  meta: 'bg-muted text-muted-foreground border-border'
};
