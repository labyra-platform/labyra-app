/**
 * Default DFT workflow topology + the calc types available in the builder.
 *
 *   vc-relax → scf → nscf → {dos, pdos}
 *                  ↘ bands → ppbands
 *
 * @phase R242-dag-editor-b2
 */
import type { DagUnit } from '@/features/computation/dag-layout';

export const CALC_TYPES = ['vc-relax', 'scf', 'nscf', 'bands', 'dos', 'pdos', 'ppbands'] as const;

export const DEFAULT_DFT_DAG: DagUnit[] = [
  { id: 'vc-relax', calcType: 'vc-relax', dependsOn: [] },
  { id: 'scf', calcType: 'scf', dependsOn: ['vc-relax'] },
  { id: 'nscf', calcType: 'nscf', dependsOn: ['scf'] },
  { id: 'bands', calcType: 'bands', dependsOn: ['scf'] },
  { id: 'dos', calcType: 'dos', dependsOn: ['nscf'] },
  { id: 'pdos', calcType: 'pdos', dependsOn: ['nscf'] },
  { id: 'ppbands', calcType: 'ppbands', dependsOn: ['bands'] }
];
