/**
 * Materials types: chemicals, reagents, supplies, equipment.
 * @phase R160-data-1
 */

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

export interface Material {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  // Core
  name: string;
  formula?: string;
  category: MaterialCategory;
  cas?: string; // CAS registry number

  // Inventory
  quantity: number;
  unit: MaterialUnit;
  location?: string; // e.g. "Shelf A3", "Fridge 2"

  // Supply chain
  supplier?: string;
  lotNumber?: string;
  purchaseDate?: number; // epoch ms
  expiryDate?: number;

  // Safety
  hazardLevel: HazardLevel;
  hazardNotes?: string;

  // Audit
  createdAt: number;
  updatedAt: number;
  createdBy: string; // uid
}
