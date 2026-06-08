/**
 * DFT computation workflow + results types.
 *
 * Mirrors the structured `results` written by the Python worker
 * (labyra-spectra-worker, qe_parser.summarize_results) into
 * tenants/{tenantId}/dftWorkflows/{workflowId}.
 *
 * @phase R238-dft-results-ui
 */

/** Band gap from band-structure eigenvalues (k-path). */
export interface DftBandGap {
  vbm_ev: number;
  cbm_ev: number;
  band_gap_ev: number;
  /** Fractional k-coords of valence-band maximum; null if k unavailable. */
  vbm_k: [number, number, number] | null;
  cbm_k: [number, number, number] | null;
  /** true = direct (VBM/CBM same k), false = indirect, null = undetermined. */
  direct: boolean | null;
}

/** Quick gap from the scf/nscf grid (HOMO/LUMO). */
export interface DftScfGap {
  gapEv: number;
  homoEv: number | null;
  lumoEv: number | null;
}

/** Relaxed cell from vc-relax final coordinates. */
export interface DftRelaxedStructure {
  aAng: number;
  cAng: number;
  coa: number | null;
  volumeAng3: number | null;
  nAtoms: number | null;
}

export interface DftResults {
  relaxedStructure?: DftRelaxedStructure;
  totalEnergyRy?: number | null;
  fermiEv?: number | null;
  nElectrons?: number | null;
  scfGap?: DftScfGap;
  bandGap?: DftBandGap;
  dosAtFermi?: number | null;
}

export type DftUnitStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

export interface DftUnitSnapshot {
  status: DftUnitStatus;
  error?: string | null;
}

export type DftOverallStatus = 'running' | 'completed' | 'failed';

export interface DftWorkflowGlobal {
  prefix?: string;
  functional?: string;
  ecutwfc?: number;
  ecutrho?: number;
}

export interface DftWorkflow {
  id: string;
  overallStatus: DftOverallStatus | null;
  results: DftResults | null;
  snapshot: Record<string, DftUnitSnapshot>;
  global?: DftWorkflowGlobal;
}
