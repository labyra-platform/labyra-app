/**
 * Authenticated client for the spectra-worker Cloud Run service.
 *
 * The worker is deployed with --no-allow-unauthenticated, so every call needs a
 * Google-signed ID token whose audience is the worker URL. We mint the token
 * with the Firebase Admin service-account credentials the app already loads
 * (FIREBASE_ADMIN_*), so no new secret is introduced — only SPECTRA_WORKER_URL.
 * That same service account must be granted roles/run.invoker on the worker.
 *
 * @phase R204 (publication figure export — app↔worker path)
 */
import 'server-only';

import { GoogleAuth } from 'google-auth-library';

export class WorkerConfigError extends Error {}
export class WorkerCallError extends Error {}

let _auth: GoogleAuth | null = null;

/** Worker base URL, e.g. https://spectra-worker-xxxx-as.a.run.app */
export function getWorkerUrl(): string {
  const url = process.env.SPECTRA_WORKER_URL;
  if (!url) {
    throw new WorkerConfigError('SPECTRA_WORKER_URL not configured');
  }
  return url.replace(/\/+$/, '');
}

/**
 * GoogleAuth built from the Firebase Admin service account. Used to mint Cloud
 * Run ID tokens (getIdTokenClient). Falls back to ADC when the env vars are
 * absent (local development with `gcloud auth application-default login`).
 */
function getWorkerAuth(): GoogleAuth {
  if (_auth) return _auth;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;

  _auth = new GoogleAuth({
    projectId,
    credentials:
      clientEmail && privateKey ? { client_email: clientEmail, private_key: privateKey } : undefined
  });
  return _auth;
}

/**
 * POST JSON to a worker endpoint and return the raw Response (caller decides how
 * to read the body — JSON or binary). Adds a Cloud Run ID token automatically.
 */
export async function callWorker(path: string, body: unknown): Promise<Response> {
  const base = getWorkerUrl();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  try {
    const client = await getWorkerAuth().getIdTokenClient(base);
    const authHeaders = await client.getRequestHeaders(base);
    authHeaders.forEach((value, key) => headers.set(key, value));
  } catch (err) {
    throw new WorkerCallError(`failed to obtain worker ID token: ${String(err)}`);
  }

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return res;
}

/** Reset singleton — test-only helper. */
export function _resetWorkerAuthForTests(): void {
  _auth = null;
}
