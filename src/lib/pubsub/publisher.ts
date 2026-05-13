/**
 * Pub/Sub publisher for spectrum analysis tasks.
 *
 * Server-only — uses @google-cloud/pubsub Node SDK.
 * On Vercel: requires GCP_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS_JSON env.
 * On local dev: gcloud ADC (Application Default Credentials).
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

  // Vercel: parse JSON credentials from env
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsJson) {
    _client = new PubSub({
      projectId: PROJECT_ID,
      credentials: JSON.parse(credsJson)
    });
  } else {
    // Local: ADC
    _client = new PubSub({ projectId: PROJECT_ID });
  }
  return _client;
}

export interface SpectrumAnalysisMessage {
  tenantId: string;
  spectrumId: string;
  spectrumType: string;
  experimentId?: string;
  // Future: priority, retryHint, etc.
}

/**
 * Publish a spectrum analysis task. Returns Pub/Sub message ID on success.
 * Errors are caller's responsibility — typically log + continue (spectrum
 * stays 'uploaded' and can be reprocessed manually).
 */
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
