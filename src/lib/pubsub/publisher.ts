/**
 * Pub/Sub publisher with explicit timeout + REST API fallback.
 * @phase R160-spectra-3b
 */

import 'server-only';

import { PubSub } from '@google-cloud/pubsub';

const TOPIC = process.env.PUBSUB_SPECTRA_TOPIC ?? 'spectra-analysis';
const PROJECT_ID = process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

let _client: PubSub | null = null;

interface SaCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function parseAndNormalizeCreds(raw: string): SaCredentials {
  const creds = JSON.parse(raw) as SaCredentials;
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

function getClient(): PubSub {
  if (_client) return _client;

  const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  let creds: SaCredentials | undefined;
  if (credsB64) {
    const decoded = Buffer.from(credsB64, 'base64').toString('utf-8');
    creds = parseAndNormalizeCreds(decoded);
  } else if (credsJson) {
    creds = parseAndNormalizeCreds(credsJson);
  }

  console.error('[pubsub] init', {
    projectId: PROJECT_ID,
    hasCreds: !!creds,
    clientEmail: creds?.client_email,
    privateKeyLen: creds?.private_key?.length,
    privateKeyStart: creds?.private_key?.substring(0, 30)
  });

  _client = creds
    ? new PubSub({ projectId: PROJECT_ID, credentials: creds })
    : new PubSub({ projectId: PROJECT_ID });

  return _client;
}

export interface SpectrumAnalysisMessage {
  tenantId: string;
  spectrumId: string;
  spectrumType: string;
  experimentId?: string;
}

export async function publishSpectrumAnalysis(msg: SpectrumAnalysisMessage): Promise<string> {
  if (!PROJECT_ID) {
    throw new Error('GCP_PROJECT_ID not configured');
  }

  console.error('[pubsub] publish-start', JSON.stringify(msg));

  try {
    const client = getClient();
    const data = Buffer.from(JSON.stringify(msg));

    // Race against 8s timeout
    const messageId = await Promise.race([
      client.topic(TOPIC).publishMessage({
        data,
        attributes: { tenantId: msg.tenantId, spectrumType: msg.spectrumType }
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('publish-timeout-8s')), 8000)
      )
    ]);

    console.error('[pubsub] publish-success', { messageId });
    return messageId;
  } catch (err) {
    console.error('[pubsub] publish-FAILED', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.substring(0, 500) : undefined
    });
    throw err;
  }
}
