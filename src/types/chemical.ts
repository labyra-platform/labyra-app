/**
 * Chemical inventory types — GHS-compliant, materials-science oriented.
 *
 * GHS = Globally Harmonized System (UN). 9 pictograms are the international
 * standard for hazard communication. We store pictogram codes (GHS01–GHS09)
 * plus optional H-statements (e.g. 'H225').
 *
 * Inventory is event-sourced: `quantity` is derived from the immutable
 * transactions sub-collection, never mutated in place.
 *
 * @phase CHEM-1
 */

/** GHS pictogram codes (UN standard). */
export type GHSPictogram =
  | 'GHS01' // Explosive
  | 'GHS02' // Flammable
  | 'GHS03' // Oxidizing
  | 'GHS04' // Compressed gas
  | 'GHS05' // Corrosive
  | 'GHS06' // Toxic (acute)
  | 'GHS07' // Harmful / irritant
  | 'GHS08' // Health hazard (CMR, etc.)
  | 'GHS09'; // Environmental hazard

/**
 * English hazard-class names, for code and logs — **not for the screen**.
 *
 * R543: this Record was rendered directly in four places across three screens,
 * which is why a Vietnamese dashboard showed "Compressed gas". A constant in a
 * types file is somewhere i18n cannot reach, and no amount of translating a
 * card fixes the other three callers. Use `t('common.ghs.GHS04')` for anything
 * a person reads; keep this for keys, tests and English-only contexts.
 */
export const GHS_LABELS: Record<GHSPictogram, string> = {
  GHS01: 'Explosive',
  GHS02: 'Flammable',
  GHS03: 'Oxidizing',
  GHS04: 'Compressed gas',
  GHS05: 'Corrosive',
  GHS06: 'Toxic',
  GHS07: 'Harmful / Irritant',
  GHS08: 'Health hazard',
  GHS09: 'Environmental hazard'
};

export type ChemicalState = 'solid' | 'liquid' | 'gas';

/** Quantity units — mass, volume, amount-of-substance. */
export type ChemicalUnit = 'g' | 'kg' | 'mg' | 'mL' | 'L' | 'mol' | 'mmol' | 'piece';

export type ChemicalStatus = 'available' | 'low' | 'empty' | 'expired';

export type ChemicalLifecycleStatus = 'active' | 'deprecated' | 'retracted';

export interface Chemical {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  // Identity
  chemicalCode: string;
  name: string;
  casNumber?: string;
  formula?: string;

  // Safety (GHS)
  ghsHazards: GHSPictogram[];
  hazardStatements?: string[]; // H-codes
  signalWord?: 'Danger' | 'Warning';

  // Quality (materials science)
  purity?: string; // e.g. '99.9%'
  grade?: string; // e.g. 'ACS reagent'
  manufacturer?: string;
  catalogNumber?: string;
  lotNumber?: string;

  // Inventory (quantity DERIVED from transactions)
  quantity: number;
  unit: ChemicalUnit;
  state: ChemicalState;
  reorderThreshold?: number;

  // Storage + expiry
  location?: string;
  storageConditions?: string;
  openedAt?: number;
  expiryAt?: number;

  // Lifecycle
  status: ChemicalStatus;
  lifecycleStatus: ChemicalLifecycleStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/** Immutable inventory transaction. quantity delta: + replenish, − consume. */
export interface ChemicalTransaction {
  id: string;
  type: 'initial' | 'consume' | 'replenish' | 'adjust';
  delta: number; // signed
  unit: ChemicalUnit;
  reason?: string;
  experimentId?: string; // optional link (future auto-deduct)
  performedBy: string;
  performedAt: number;
}
