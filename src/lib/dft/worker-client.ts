/**
 * DFT worker client — server-to-server calls to the Cloud Run worker.
 *
 * Auth isolated here. Default: Cloud Run IAM via a minted ID token
 * (google-auth-library), matching the worker's authenticated invoker setting.
 *
 * Setup: env DFT_WORKER_URL; the app runtime identity needs roles/run.invoker
 * on the worker; google-auth-library must resolve (transitive via firebase-admin).
 *
 * @phase R253-dft-preview
 */
import 'server-only';
import { GoogleAuth } from 'google-auth-library';

const WORKER_URL = process.env.DFT_WORKER_URL;

export interface WorkerResult {
  ok: boolean;
  status: number;
  data: unknown;
}

async function callWorker(path: string, body: unknown): Promise<WorkerResult> {
  if (!WORKER_URL) {
    throw new Error('DFT_WORKER_URL is not configured');
  }
  const auth = new GoogleAuth();
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

export interface SubmitWorkflowBody {
  tenantId: string;
  workflowId: string;
  workflow: unknown;
  machinePreset: string;
  maxRunSec?: number;
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
