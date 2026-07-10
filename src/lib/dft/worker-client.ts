/**
 * DFT worker client — server-to-server calls to the Cloud Run worker.
 *
 * Auth: a minted Cloud Run ID token. Credentials resolve in this order:
 *   1. GCP_SA_KEY env (a service-account key JSON, one var) — works on Vercel,
 *      where Application Default Credentials are unavailable.
 *   2. Application Default Credentials (GCP runtime, or a local
 *      GOOGLE_APPLICATION_CREDENTIALS file).
 * The worker stays IAM-locked (--no-allow-unauthenticated); the app identity (or
 * the GCP_SA_KEY service account) needs roles/run.invoker on the worker.
 *
 * Setup: env DFT_WORKER_URL (+ GCP_SA_KEY on Vercel).
 *
 * @phase R261-sa-key-auth
 */
import 'server-only';
import { GoogleAuth } from 'google-auth-library';

const WORKER_URL = process.env.DFT_WORKER_URL;

/** Use an explicit SA key (Vercel) when present; else fall back to ADC. */
function makeAuth(): GoogleAuth {
  const raw = process.env.GCP_SA_KEY;
  if (raw && raw.trim().length > 0) {
    try {
      return new GoogleAuth({ credentials: JSON.parse(raw) as Record<string, unknown> });
    } catch {
      // malformed key → fall back to ADC below
    }
  }
  return new GoogleAuth();
}

export interface WorkerResult {
  ok: boolean;
  status: number;
  data: unknown;
}

async function callWorker(path: string, body: unknown): Promise<WorkerResult> {
  if (!WORKER_URL) {
    throw new Error('DFT_WORKER_URL is not configured');
  }
  const auth = makeAuth();
  const client = await auth.getIdTokenClient(WORKER_URL);
  const resp = await client.request({
    url: `${WORKER_URL}${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    validateStatus: () => true
  });
  return {
    ok: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    data: resp.data
  };
}

async function callWorkerGet(path: string): Promise<WorkerResult> {
  if (!WORKER_URL) {
    throw new Error('DFT_WORKER_URL is not configured');
  }
  const auth = makeAuth();
  const client = await auth.getIdTokenClient(WORKER_URL);
  const resp = await client.request({
    url: `${WORKER_URL}${path}`,
    method: 'GET',
    validateStatus: () => true
  });
  return {
    ok: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    data: resp.data
  };
}

export interface SubmitWorkflowBody {
  tenantId: string;
  workflowId: string;
  workflow: unknown;
  machinePreset: string;
  maxRunSec?: number;
  createdBy?: string;
  createdByUid?: string;
}

export function submitWorkflowToWorker(body: SubmitWorkflowBody): Promise<WorkerResult> {
  return callWorker('/dft/submit', body);
}

export interface PreviewInputBody {
  calcType: string;
  structure: unknown;
  global: unknown;
  params: unknown;
}

/** Render the QE .in for one unit (no save / no run) — for the node panel PREVIEW. */
export function previewDftInput(body: PreviewInputBody): Promise<WorkerResult> {
  return callWorker('/dft/preview', body);
}

export interface FetchBandsBody {
  tenantId: string;
  workflowId: string;
  unitId: string;
}
/** Band-structure plot data for one bands unit (no re-run) — for the Bands tab. */
export interface BuildStructureBody {
  source: 'cif' | 'poscar' | 'mp_id';
  cif_text?: string;
  poscar_text?: string;
  mp_id?: string;
  use_primitive?: boolean;
  prefer_ibrav?: boolean;
}

/** Build an ibrav-verified DftStructure from CIF / POSCAR / Materials Project id. */
export function buildStructure(body: BuildStructureBody): Promise<WorkerResult> {
  return callWorker('/dft/structure', body);
}

export interface MpSearchResult {
  mpId: string;
  formula: string;
  crystalSystem: string;
  spaceGroup: string;
  spaceGroupNumber: number | null;
  nsites: number | null;
  energyAboveHull: number | null;
  bandGap: number | null;
  isGapDirect: boolean | null;
  density: number | null;
  volume: number | null;
  theoretical: boolean | null;
}

/** Search Materials Project (mp-id / chemsys / elements / formula) — import picker. */
export function searchMaterials(query: string, limit = 30): Promise<WorkerResult> {
  return callWorker('/materials/search', { query, limit });
}

export interface SceneAtom {
  el: string;
  xyz: [number, number, number];
  color: string;
  radius: number;
}
export interface SceneBond {
  from: [number, number, number];
  to: [number, number, number];
}
export interface StructureScene {
  formula: string;
  lattice: number[][];
  natoms: number;
  atoms: SceneAtom[];
  bonds: SceneBond[];
}

/** Reconstruct a stored DftStructure into a render scene (atoms + CrystalNN bonds). */
export function buildStructureScene(structure: unknown): Promise<WorkerResult> {
  return callWorker('/dft/structure/scene', { structure });
}

/** Full crystallographic analysis (symmetry, Wyckoff, density, oxidation, …). */
export function analyzeStructure(structure: unknown): Promise<WorkerResult> {
  return callWorker('/dft/structure/analysis', { structure });
}

/** First Brillouin zone (facets) + high-symmetry k-points + band path. */
export interface BrillouinZone {
  facets: number[][][];
  points: Record<string, number[]>;
  segments: [string, string][];
  reciprocal: number[][];
}

export function fetchBrillouinZone(structure: unknown): Promise<WorkerResult> {
  return callWorker('/dft/structure/brillouin', { structure });
}

/** Materials Project summary (band gap, hull, formation energy, …) by mp-id. */
export function fetchStructureMpSummary(mpId: string): Promise<WorkerResult> {
  return callWorker('/materials/summary', { mpId });
}

/** Emit CIF / POSCAR text for a stored DftStructure. */
export function exportStructure(structure: unknown, fmt: 'cif' | 'poscar'): Promise<WorkerResult> {
  return callWorker('/dft/structure/export', { structure, fmt });
}

export interface KpathResult {
  point_coords: Record<string, [number, number, number]>;
  segments: [string, string][];
  path: { label: string; coords: [number, number, number]; npoints: number }[];
  bravais?: string | null;
}

/** seekpath high-symmetry BZ path for a stored DftStructure (bands crystal_b). */
export function getKpath(structure: unknown): Promise<WorkerResult> {
  return callWorker('/dft/kpath', { structure });
}

export function fetchDftBands(body: FetchBandsBody): Promise<WorkerResult> {
  return callWorker('/dft/bands', body);
}

export interface FetchDosBody {
  tenantId: string;
  workflowId: string;
}
/** Total + projected DOS for a workflow's dos/pdos units — for the Bands tab. */
export function fetchDftDos(body: FetchDosBody): Promise<WorkerResult> {
  return callWorker('/dft/dos', body);
}

/** Consolidated scientific summary (gap/DOS/PDOS/spin/energy) — Results tab. */
export function fetchDftResults(body: FetchDosBody): Promise<WorkerResult> {
  return callWorker('/dft/results', body);
}

export interface FetchConvergenceBody {
  tenantId: string;
  workflowId: string;
  unitId?: string;
}
/** SCF + ionic-relaxation convergence history — for the Convergence tab. */
export function fetchDftConvergence(body: FetchConvergenceBody): Promise<WorkerResult> {
  return callWorker('/dft/convergence', body);
}

export interface PseudoInfo {
  filename: string;
  element: string | null;
}
/** List the tenant's uploaded pseudopotential UPFs (GCS pseudo/ prefix). */
export function listPseudos(): Promise<WorkerResult> {
  return callWorkerGet('/dft/pseudo/list');
}
/** Upload one .UPF (base64) into the tenant's pseudopotential library. */
export function uploadPseudo(filename: string, contentB64: string): Promise<WorkerResult> {
  return callWorker('/dft/pseudo/upload', { filename, contentB64 });
}

export interface FetchAvgpotBody {
  tenantId: string;
  workflowId: string;
  unitId?: string;
}
/** Planar/macroscopic-averaged potential V(z) — for the Potential tab. */
export function fetchDftAvgpot(body: FetchAvgpotBody): Promise<WorkerResult> {
  return callWorker('/dft/avgpot', body);
}

export interface ReconcileBody {
  tenantId: string;
  workflowId: string;
}
/** Poll Batch for stuck/vanished units and fail them — for a running-workflow poll. */
export function reconcileDftWorkflow(body: ReconcileBody): Promise<WorkerResult> {
  return callWorker('/dft/reconcile', body);
}

export interface CancelBody {
  tenantId: string;
  workflowId: string;
  unitId?: string;
}
/** Stop a running workflow (or one unit) — cancels the Batch job(s). */
export function cancelDftWorkflow(body: CancelBody): Promise<WorkerResult> {
  return callWorker('/dft/cancel', body);
}

export interface NbndSuggestBody {
  tenantId: string;
  structure: unknown;
  pseudoMap: Record<string, string>;
  nspin?: number;
}
/** Minimum nbnd from valence electrons (Σ z_valence of assigned UPFs). */
export function suggestDftNbnd(body: NbndSuggestBody): Promise<WorkerResult> {
  return callWorker('/dft/nbnd-suggest', body);
}
