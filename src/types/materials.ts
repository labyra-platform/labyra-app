/**
 * Materials types — scientific reference catalog.
 *
 * Material = a reference library of materials the lab studies (WO₃, MoS₂,
 * rGO…), NOT a chemical inventory. Inventory/supply-chain/GHS data lives in
 * the Chemical entity; rich scientific data (XRD/Raman/FTIR peaks, bandgap,
 * crystal system) lives in the global MaterialProfile keyed by formula.
 *
 * Extends ProvBase per ADR-016 PROV-O ELN architecture.
 * Document ID format: `mat_<slug>_<seq>` (e.g. `mat_wo3_001`)
 *
 * @phase R232-material-catalog-refocus (was R164-phase-1-types)
 */

import type { ProvBase } from './prov-base';

/** Scientific material classes (replaces the old inventory-style categories). */
export type MaterialCategory =
  | 'oxide'
  | 'sulfide'
  | 'nitride'
  | 'carbon'
  | 'metal'
  | 'polymer'
  | 'composite'
  | 'perovskite'
  | 'two_dimensional'
  | 'other';

/**
 * @deprecated Inventory units belong to the Chemical entity. Kept exported only
 * to avoid breaking external imports; not used by Material anymore.
 */
export type MaterialUnit = 'g' | 'kg' | 'mg' | 'mL' | 'L' | 'µL' | 'mol' | 'mmol' | 'piece' | 'box';

/**
 * @deprecated GHS hazard belongs to the Chemical entity. Kept exported only to
 * avoid breaking external imports; not used by Material anymore.
 */
export type HazardLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export interface Material extends ProvBase {
  schemaVersion: 2;

  // Core reference fields
  name: string;
  formula?: string;
  category: MaterialCategory;
  description?: string;
}
