/**
 * A saved DFT step preset — a named, reusable parameter set for one calc type, so
 * a member can set up a similar material/calculation quickly next time (a
 * "favourites" library for compose steps).
 *
 * Storage: tenants/{tid}/dftStepPresets/{presetId}.
 *
 * @phase R280 — step presets
 */
import type { NodeParams } from '@/features/computation/compose-model';
import type { ProvBase } from '@/types/prov-base';
import type { DftCalcType } from '@/types/dft';

export interface DftStepPreset extends ProvBase {
  name: string;
  calcType: DftCalcType;
  params: NodeParams;
}
