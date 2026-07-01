/**
 * CrystalStructure — a reusable, computation-ready crystal structure (a specific
 * cell/polytype), distinct from the formula-level `Material` reference catalog.
 * One formula (e.g. WS₂) can have several structures (2H bulk, 1T monolayer,
 * a supercell…). Each is imported from CIF / POSCAR / Materials Project via the
 * worker's /dft/structure gateway (ibrav-verified) and can seed a computation.
 *
 * Path: tenants/{tenantId}/crystalStructures/{id}  (id = `cst_<slug>_<seq>`)
 *
 * @phase R318-crystal-structures
 */
import type { DftStructure } from './dft';
import type { ProvBase } from './prov-base';
import type { StructureScene } from '@/lib/dft/worker-client';

export type StructureSource = 'cif' | 'poscar' | 'mp_id' | 'manual';

export interface CrystalStructure extends ProvBase {
  schemaVersion: 1;
  /** User-facing label, e.g. "2H-WS₂ (bulk)". */
  name: string;
  source: StructureSource;
  /** Materials Project id when source = mp_id (recorded for CC-BY attribution). */
  mpId?: string;
  /** Whether the worker's ibrav round-trip verified the cell. */
  verified?: boolean;
  /** Computation-ready payload (matches §5.1 DftStructure). */
  structure: DftStructure;
  /** Precomputed Three.js render scene (atoms + bonds), cached so the 3D viewer
   *  loads from Firestore without a worker round-trip. Absent on legacy docs. */
  scene?: StructureScene;
}

export interface CreateCrystalStructureInput {
  name: string;
  source: StructureSource;
  mpId?: string;
  verified?: boolean;
  structure: DftStructure;
  scene?: StructureScene;
}
