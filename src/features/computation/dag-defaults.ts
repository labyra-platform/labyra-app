/**
 * Default DFT workflow topology — the verified 7-unit DAG used as the editor's
 * starting graph. Topology only (params attach in the config phase).
 *
 *   vc-relax → scf → nscf → {dos, pdos}
 *                  ↘ bands → ppbands
 *
 * @phase R241-dag-editor
 */
import type { DagUnit } from '@/features/computation/dag-layout';

export const DEFAULT_DFT_DAG: DagUnit[] = [
  { id: 'vc-relax', calcType: 'vc-relax', dependsOn: [] },
  { id: 'scf', calcType: 'scf', dependsOn: ['vc-relax'] },
  { id: 'nscf', calcType: 'nscf', dependsOn: ['scf'] },
  { id: 'bands', calcType: 'bands', dependsOn: ['scf'] },
  { id: 'dos', calcType: 'dos', dependsOn: ['nscf'] },
  { id: 'pdos', calcType: 'pdos', dependsOn: ['nscf'] },
  { id: 'ppbands', calcType: 'ppbands', dependsOn: ['bands'] }
];
