/**
 * Pub/Sub publisher using REST API (avoids gRPC issues in Vercel serverless).
 * @phase R160-spectra-3b
 */
// R165-phase-1-oxlint: oxlint cleanup

import 'server-only';

import { GoogleAuth } from 'google-auth-library';

const TOPIC = process.env.PUBSUB_SPECTRA_TOPIC ?? 'spectra-analysis';
const PROJECT_ID = process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

let _auth: GoogleAuth | null = null;

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

function getAuth(): GoogleAuth {
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
    projectId: PROJECT_ID,
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/pubsub']
  });
  return _auth;
}

// R164-phase-5b-1: rename SpectrumAnalysisMessage → MeasurementAnalysisMessage
// Worker (Phase 5a) accepts both spectrumId + measurementId fields.
export interface MeasurementAnalysisMessage {
  tenantId: string;
  measurementId: string;
  spectrumType: string;
  experimentId?: string;
  /** Firestore collection name. R164: "measurements". Legacy: "spectra". */
  collection?: 'measurements' | 'spectra';
}

/** @deprecated Use MeasurementAnalysisMessage. Kept for old callers. */
export type SpectrumAnalysisMessage = MeasurementAnalysisMessage;

// R164-phase-5b-1: canonical name is publishMeasurementAnalysis.
export async function publishMeasurementAnalysis(msg: MeasurementAnalysisMessage): Promise<string> {
  // Always set collection to 'measurements' if not specified (R164 default).
  if (!msg.collection) msg.collection = 'measurements';
  return publishImpl(msg);
}

/** @deprecated Use publishMeasurementAnalysis. */
export async function publishSpectrumAnalysis(msg: {
  tenantId: string;
  spectrumId: string;
  spectrumType: string;
  experimentId?: string;
}): Promise<string> {
  return publishMeasurementAnalysis({
    tenantId: msg.tenantId,
    measurementId: msg.spectrumId,
    spectrumType: msg.spectrumType,
    experimentId: msg.experimentId,
    collection: 'measurements'
  });
}

async function publishImpl(msg: MeasurementAnalysisMessage): Promise<string> {
  if (!PROJECT_ID) {
    throw new Error('GCP_PROJECT_ID not configured');
  }

  const auth = getAuth();
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  if (!token) {
    throw new Error('Failed to obtain access token');
  }

  const url = `https://pubsub.googleapis.com/v1/projects/${PROJECT_ID}/topics/${TOPIC}:publish`;
  const body = {
    messages: [
      {
        data: Buffer.from(JSON.stringify(msg)).toString('base64'),
        attributes: {
          tenantId: msg.tenantId,
          spectrumType: msg.spectrumType
        }
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Pub/Sub REST publish failed ${response.status}: ${errorText.substring(0, 300)}`
    );
  }

  const result = (await response.json()) as { messageIds?: string[] };
  const messageId = result.messageIds?.[0];
  if (!messageId) {
    throw new Error('Pub/Sub returned no messageId');
  }

  return messageId;
}
