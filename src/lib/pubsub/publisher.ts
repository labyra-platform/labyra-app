/**
 * Pub/Sub publisher for spectrum analysis tasks.
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
  // PEM private_key requires literal newlines, not escaped \n.
  // After JSON.parse, both literal and escaped are already real \n,
  // but defensive normalization handles edge cases (e.g., double-escaped).
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

function getClient(): PubSub {
  if (_client) return _client;

  const credsB64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (credsB64) {
    const decoded = Buffer.from(credsB64, 'base64').toString('utf-8');
    const creds = parseAndNormalizeCreds(decoded);
    console.log('[pubsub] Using base64 SA credentials, client_email:', creds.client_email);
    _client = new PubSub({ projectId: PROJECT_ID, credentials: creds });
  } else if (credsJson) {
    const creds = parseAndNormalizeCreds(credsJson);
    console.log('[pubsub] Using JSON SA credentials, client_email:', creds.client_email);
    _client = new PubSub({ projectId: PROJECT_ID, credentials: creds });
  } else {
    console.log('[pubsub] Using ADC (no explicit credentials)');
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
  console.log('[pubsub] Publishing message:', JSON.stringify(msg));
  const client = getClient();
  const data = Buffer.from(JSON.stringify(msg));
  const messageId = await client.topic(TOPIC).publishMessage({
    data,
    attributes: { tenantId: msg.tenantId, spectrumType: msg.spectrumType }
  });
  console.log('[pubsub] Published messageId:', messageId);
  return messageId;
}
