/**
 * DFT worker client — server-to-server call to the Cloud Run worker.
 *
 * Auth isolated here. Default: Cloud Run IAM via a minted ID token
 * (google-auth-library), matching the worker's authenticated invoker setting.
 *
 * Setup: env DFT_WORKER_URL; the app runtime identity needs roles/run.invoker
 * on the worker; google-auth-library must resolve (transitive via firebase-admin).
 *
 * @phase R245-dag-editor-b4-serialize
 */
import 'server-only';
import { GoogleAuth } from 'google-auth-library';

const WORKER_URL = process.env.DFT_WORKER_URL;

export interface SubmitWorkflowBody {
  tenantId: string;
  workflowId: string;
  workflow: unknown;
  machinePreset: string;
  maxRunSec?: number;
}

export interface WorkerResult {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function submitWorkflowToWorker(body: SubmitWorkflowBody): Promise<WorkerResult> {
  if (!WORKER_URL) {
    throw new Error('DFT_WORKER_URL is not configured');
  }
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(WORKER_URL);
  const resp = await client.request({
    url: `${WORKER_URL}/dft/submit`,
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
