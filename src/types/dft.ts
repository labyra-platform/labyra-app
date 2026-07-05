/**
 * DFT computation workflow + results types.
 *
 * Two contracts, deliberately separate (reconciled against the worker + the
 * DFT architecture report §5.1):
 *
 *  1. `DftWorkflow` — the ACTUAL Firestore document at
 *     tenants/{tid}/dftWorkflows/{wid} as written by labyra-spectra-worker.
 *     Top-level holds the submitted definition (`structure`, `global`, `units`);
 *     the worker adds `snapshot` (a per-unit STATUS map keyed by unitId),
 *     `overallStatus`, `relaxedStructures` (JSON string) and the parsed
 *     `results` (qe_parser.summarize_results). This is what the app READS.
 *
 *  2. `DftWorkflowSpec` — the canonical flat design from
 *     `labyra-dft-pbe-u-architecture.md` §5.1 (extends ProvBase, carries
 *     name/pseudoMap/computeBackend/cloudConfig). The TARGET write contract;
 *     serialization moves toward it. Not all of it is persisted yet.
 *
 * Shared building blocks (DftStructure / DftUnit / DftUnitParams / KPointsSpec /
 * enums) are used by both. DftUnitParams is extended beyond §5.1 with the
 * parameters the worker actually emits (vdW DFT-D3 — R272w-w, needed for WS₂;
 * diagonalization/force/stress flags; post-processing fields).
 *
 * Per-unit execution STATUS lives in `DftWorkflow.snapshot[unitId].status`,
 * NOT on the unit itself — the UI merges it onto the node when rendering.
 *
 * @phase R247-dft-types-reconcile-spec
 */
import type { ProvBase } from './prov-base';

// ─────────────────────────────────────────────────────────────────────────
// Enums (§5.1)
// ─────────────────────────────────────────────────────────────────────────

/** MVP: PBE only. Future: hybrid / GGA variants. */
export type DftFunctional = 'pbe' | 'hse' | 'pbesol';

export type DftCalcType =
  | 'vc-relax'
  | 'relax'
  | 'scf'
  | 'nscf'
  | 'bands'
  | 'ppbands'
  | 'dos'
  | 'pdos'
  | 'charge'
  | 'avgpot';

export type DftExecutable = 'pw.x' | 'bands.x' | 'dos.x' | 'projwfc.x' | 'pp.x';

/** Per-unit lifecycle (worker maps Cloud Batch job state onto these). */
export type DftUnitStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

/** Workflow-level rollup written by the worker. */
export type DftOverallStatus = 'running' | 'completed' | 'failed';

// ─────────────────────────────────────────────────────────────────────────
// Structure (§5.1 DftStructure) — matches the doc's top-level `structure`
// ─────────────────────────────────────────────────────────────────────────

export interface AtomicSpecies {
  element: string;
  mass: number;
  pseudoFile: string;
}

export interface AtomicPosition {
  element: string;
  x: number;
  y: number;
  z: number;
}

/** Hubbard U manifold, e.g. { manifold: 'W-5d', value: 6.2 }. */
export interface HubbardParam {
  manifold: string;
  value: number;
}

export interface DftStructure {
  ibrav: number;
  /** celldm(i) by index, e.g. { 1: 13.9439, 3: 0.5133 }. */
  celldm: Record<number, number>;
  /** 3×3 lattice matrix when ibrav=0 / free cell (worker-emitted). */
  cellParameters?: number[][];
  nat: number;
  ntyp: number;
  atomicSpecies: AtomicSpecies[];
  atomicPositions: AtomicPosition[];
  positionsType: 'crystal' | 'angstrom';
  spaceGroup?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// k-points (§5.1 KPointsSpec)
// ─────────────────────────────────────────────────────────────────────────

export interface KPathPoint {
  coords: [number, number, number];
  npoints: number;
  label: string;
}

export interface KPointsSpec {
  type: 'automatic' | 'crystal_b';
  /** automatic grid */
  grid?: [number, number, number];
  shift?: [number, number, number];
  /** crystal_b k-path (bands) */
  path?: KPathPoint[];
}

// ─────────────────────────────────────────────────────────────────────────
// Per-unit params (§5.1 DftUnitParams + worker-real extensions)
// Risk groups per §4.4: A=constraint, B=tuning(advanced), C=fixed, D=quality.
// ─────────────────────────────────────────────────────────────────────────

export interface DftUnitParams {
  // Core (§5.1)
  calculation?: string; // 'scf' | 'nscf' | 'vc-relax' ...
  nbnd?: number;
  occupations?: 'fixed' | 'smearing';
  smearing?: string; // 'gaussian' | 'm-p' ...
  degauss?: number;
  kPoints?: KPointsSpec;
  /** §4.4 group D (quality) — baseline-tracked in the UI. */
  convThr?: number;

  // Algorithm tuning — §4.4 group B (advanced); worker-emitted, beyond §5.1
  diagoDavidNdim?: number;
  electronMaxstep?: number;
  tstress?: boolean;
  tprnfor?: boolean;

  // vdW DFT-D3 (R272w-w) — required for layered materials (WS₂); beyond §5.1
  vdwCorr?: string; // 'grimme-d3' — enables Grimme-D3 dispersion
  dftd3Version?: number; // 3 = D3(0) zero-damping, 4 = D3-BJ (default)
  dftd3Threebody?: boolean;

  // relax / vc-relax (§5.1)
  ionDynamics?: string; // 'bfgs'
  cellDynamics?: string;
  cellDofree?: string; // 'all' | '2Dxy' ...

  // pp.x post-processing (§5.1)
  plotNum?: number; // 0 | 5 | 9
  sampleBias?: number; // STM
  iflag?: number; // 3 = 3D
  outputFormat?: number; // 6 = cube

  // dos.x / projwfc.x / bands.x post-processing — worker-emitted
  Emin?: number;
  Emax?: number;
  DeltaE?: number;
  ngauss?: number;
  lsym?: boolean;
  /** post-processing output label (dos/pdos/ppbands). */
  name?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Unit — READ shape (doc.units[i]); §5.1-rich fields optional (not all stored)
// ─────────────────────────────────────────────────────────────────────────

export interface DftUnit {
  id: string;
  calcType: DftCalcType;
  /** DAG edges — unitIds that must finish first. */
  dependsOn: string[];
  params: DftUnitParams;
  /** QE pool-parallelism hint (worker-level; not part of §5.1 unit). */
  npool?: number;

  // §5.1 fields populated by the builder / future migration (optional today)
  flowchartId?: string;
  order?: number;
  executable?: DftExecutable;
  name?: string;
  /** Jinja2 source; '' / undefined = default template for calcType. */
  templateJinja?: string;
  outdir?: string;
  inputFileGcs?: string;
  outputFileGcs?: string;
  parsedResultGcs?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Global block — doc.global (nested). §5.1 hoists these onto the workflow.
// ─────────────────────────────────────────────────────────────────────────

export interface DftWorkflowGlobal {
  prefix?: string;
  functional?: DftFunctional;
  ecutwfc?: number;
  ecutrho?: number;
  hubbard?: HubbardParam[];
  /** Per-element pseudopotential assignment (element → uploaded .UPF filename). */
  pseudoMap?: Record<string, string>;
  /** Grimme-D3 dispersion, applied to every pw.x step for energy consistency. */
  vdwCorr?: string; // 'grimme-d3'
  dftd3Version?: number; // 3 = D3(0) zero-damping, 4 = D3-BJ (default)
}

// ─────────────────────────────────────────────────────────────────────────
// Parsed results (qe_parser.summarize_results) — §5.1 does not define these.
// NOTE: bandGap sub-keys are snake_case to match what the worker stores today.
// ─────────────────────────────────────────────────────────────────────────

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
  /** Crystal density g/cm³ (Σ atomic mass / cell volume); null if undetermined. */
  density?: number | null;
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

// ─────────────────────────────────────────────────────────────────────────
// Status map value — doc.snapshot[unitId]
// ─────────────────────────────────────────────────────────────────────────

export interface DftUnitSnapshot {
  status: DftUnitStatus;
  /** Epoch seconds (worker `time.time()`) when the unit started running. */
  startedAt?: number | null;
  /** Epoch seconds when the unit reached a terminal state (completed/failed). */
  finishedAt?: number | null;
  /** The worker writes `errorMessage`; `error` kept for older documents. */
  errorMessage?: string | null;
  error?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// (1) READ contract — the Firestore document as written by the worker.
// ─────────────────────────────────────────────────────────────────────────

export interface DftWorkflow {
  id: string;
  overallStatus: DftOverallStatus | null;
  results: DftResults | null;
  /** Per-unit status, keyed by unitId. */
  snapshot: Record<string, DftUnitSnapshot>;
  /** Compose/submit time (epoch ms) and the user who launched it, for the job list. */
  createdAt?: number | null;
  createdBy?: string | null;
  /** Workflow definition (top-level in the doc) — needed to render the DAG. */
  structure?: DftStructure;
  global?: DftWorkflowGlobal;
  units?: DftUnit[];
}

// ─────────────────────────────────────────────────────────────────────────
// (2) CANONICAL spec — §5.1 flat design (target write contract / migration).
// ─────────────────────────────────────────────────────────────────────────

export interface DftCloudConfig {
  /** Preset combo only — never raw cpu/mem (materials users). */
  machinePreset: 'low' | 'standard' | 'high-gpu';
  /** Guardrail against runaway/hung jobs. */
  maxRunDurationSec: number;
  /** Spot VM (60-91% cheaper); default true. */
  useSpot: boolean;
}

export interface DftWorkflowSpec extends ProvBase {
  schemaVersion: 1;
  name: string;
  /** Link to a Material entity (PROV-O derivedFrom). */
  materialId?: string;
  structure: DftStructure;
  /** element → pseudopotential id. */
  pseudoMap: Record<string, string>;
  functional: DftFunctional;
  ecutwfc: number;
  ecutrho: number;
  hubbard: HubbardParam[];
  protocol?: 'fast' | 'moderate' | 'precise';
  units: DftUnit[];
  computeBackend: 'generate-only' | 'cloud-batch';
  cloudConfig?: DftCloudConfig;
  overallStatus: DftUnitStatus;
}
