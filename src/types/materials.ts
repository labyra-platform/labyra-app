/**
 * Materials types: chemicals, reagents, supplies, equipment.
 *
 * Extends ProvBase per ADR-016 PROV-O ELN architecture.
 * Document ID format: `mat_<slug>_<seq>` (e.g. `mat_wo3_001`)
 *
 * @phase R164-phase-1-types (was R160-data-1)
 */

import type { ProvBase } from './prov-base';

export type MaterialCategory =
  | 'chemical'
  | 'reagent'
  | 'solvent'
  | 'gas'
  | 'consumable'
  | 'equipment'
  | 'other';

export type MaterialUnit = 'g' | 'kg' | 'mg' | 'mL' | 'L' | 'µL' | 'mol' | 'mmol' | 'piece' | 'box';

export type HazardLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export interface Material extends ProvBase {
  schemaVersion: 2; // bumped from 1 for ProvBase migration

  // Core
  name: string;
  formula?: string;
  category: MaterialCategory;
  cas?: string;

  // Inventory
  quantity: number;
  unit: MaterialUnit;
  location?: string;

  // Supply chain
  supplier?: string;
  lotNumber?: string;
  purchaseDate?: number;
  expiryDate?: number;

  // Safety
  hazardLevel: HazardLevel;
  hazardNotes?: string;
}
