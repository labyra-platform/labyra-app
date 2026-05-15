/**
 * GoogleAuth singleton + project ID resolution for Pub/Sub REST publish.
 *
 * Extracted from publisher.ts (R168-3.1a). Shared by all publish-to-topic
 * callers — single auth surface, single env-var contract.
 *
 * @phase R168-3.1a
 */
import 'server-only';
import { GoogleAuth } from 'google-auth-library';
import { PubSubConfigError } from './errors';

interface SaCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

let _auth: GoogleAuth | null = null;

function parseAndNormalizeCreds(raw: string): SaCredentials {
  const creds = JSON.parse(raw) as SaCredentials;
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

/**
 * Resolve project ID from env. Throws PubSubConfigError if unset.
 *
 * Priority: GCP_PROJECT_ID > NEXT_PUBLIC_FIREBASE_PROJECT_ID.
 */
export function getProjectId(): string {
  const pid = process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!pid) {
    throw new PubSubConfigError(
      'GCP_PROJECT_ID not configured (also tried NEXT_PUBLIC_FIREBASE_PROJECT_ID)'
    );
  }
  return pid;
}

/**
 * Get GoogleAuth singleton with Pub/Sub scope.
 *
 * Credentials priority:
 *   1. GOOGLE_APPLICATION_CREDENTIALS_BASE64 (Vercel-friendly)
 *   2. GOOGLE_APPLICATION_CREDENTIALS_JSON (raw JSON)
 *   3. ADC fallback (gcloud auth application-default login locally)
 */
export function getAuth(): GoogleAuth {
  if (_auth) return _auth;

  const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  let creds: SaCredentials | undefined;
  if (credsB64) {
    creds = parseAndNormalizeCreds(Buffer.from(credsB64, 'base64').toString('utf-8'));
  } else if (credsJson) {
    creds = parseAndNormalizeCreds(credsJson);
  }

  _auth = new GoogleAuth({
    projectId: getProjectId(),
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/pubsub']
  });
  return _auth;
}

/** Reset singleton — test-only helper. */
export function _resetAuthForTests(): void {
  _auth = null;
}
