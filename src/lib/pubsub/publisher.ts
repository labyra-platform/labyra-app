/**
 * Pub/Sub publisher for spectrum analysis tasks.
 *
 * Server-only — uses @google-cloud/pubsub Node SDK.
 * Vercel: uses GOOGLE_APPLICATION_CREDENTIALS_BASE64 (avoids JSON escape issues).
 * Local dev: uses ADC via `gcloud auth application-default login`.
 *
 * @phase R160-spectra-3b
 */

import 'server-only';

import { PubSub } from '@google-cloud/pubsub';

const TOPIC = process.env.PUBSUB_SPECTRA_TOPIC ?? 'spectra-analysis';
const PROJECT_ID = process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

let _client: PubSub | null = null;

function getClient(): PubSub {
  if (_client) return _client;

  // Prefer base64 (Vercel-safe), fallback to raw JSON, finally ADC.
  const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (credsB64) {
    const decoded = Buffer.from(credsB64, 'base64').toString('utf-8');
    _client = new PubSub({
      projectId: PROJECT_ID,
      credentials: JSON.parse(decoded)
    });
  } else if (credsJson) {
    _client = new PubSub({
      projectId: PROJECT_ID,
      credentials: JSON.parse(credsJson)
    });
  } else {
    _client = new PubSub({ projectId: PROJECT_ID });
  }
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
  const client = getClient();
  const data = Buffer.from(JSON.stringify(msg));
  const messageId = await client.topic(TOPIC).publishMessage({
    data,
    attributes: {
      tenantId: msg.tenantId,
      spectrumType: msg.spectrumType
    }
  });
  return messageId;
}
