/**
 * Samples types: prepared samples derived from materials.
 * @phase R160-data-1
 */

export type SampleStatus = 'prepared' | 'in_use' | 'consumed' | 'archived' | 'discarded';

export interface Sample {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  // Identity
  sampleCode: string; // e.g. "S-2026-001"
  name: string;
  description?: string;

  // Lineage
  parentMaterialIds: string[]; // sources from Materials
  derivedFromSampleId?: string; // chain of derivation

  // Preparation
  preparedAt: number; // epoch ms
  preparedBy: string; // uid
  protocol?: string;

  // Properties
  mass?: number; // grams
  volume?: number; // mL
  concentration?: number;
  concentrationUnit?: string;

  // Status
  status: SampleStatus;
  location?: string;

  // Audit
  createdAt: number;
  updatedAt: number;
}
