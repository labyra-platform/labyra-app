/**
 * Generic Pub/Sub publish primitive. Layer 2 (transport + semantics).
 *
 * Domain wrappers in src/lib/pubsub/topics/* should be the ONLY callers.
 * Direct callers from app code are an anti-pattern: use the typed wrapper.
 *
 * Returns {messageId, latencyMs} so wrapper can emit domain log with full
 * observability fields.
 *
 * @phase R168-3.1a
 */
import 'server-only';
import { getAuth, getProjectId } from './auth';
import { PubSubAuthError, PubSubPublishError } from './errors';

export interface PublishOptions<TMessage> {
  /** Topic short name, e.g. 'paper-processing'. NOT full resource path. */
  topic: string;
  /** Domain message — will be JSON.stringified then base64-encoded. */
  message: TMessage;
  /**
   * Pub/Sub message attributes (sent as headers — useful for subscription
   * filters). Keys + values must be strings.
   */
  attributes?: Record<string, string>;
  /**
   * Optional pre-publish validator. Throw to abort. Useful for Zod schema
   * checks. Runs synchronously before any network call (fail fast).
   */
  validate?: (message: TMessage) => void;
}

export interface PublishResult {
  messageId: string;
  /** Round-trip publish latency (ms). */
  latencyMs: number;
}

/**
 * Publish a message to a Pub/Sub topic via REST API.
 *
 * gRPC (@google-cloud/pubsub SDK) breaks on Vercel serverless — REST is the
 * Vercel-compatible path. Worker subscribers can use gRPC freely.
 *
 * Throws:
 *   - PubSubConfigError if env missing
 *   - PubSubAuthError if token acquisition fails
 *   - PubSubPublishError on HTTP non-2xx (preserves status + body)
 */
export async function publishToTopic<TMessage>(
  opts: PublishOptions<TMessage>
): Promise<PublishResult> {
  if (opts.validate) opts.validate(opts.message);

  const projectId = getProjectId();
  const auth = getAuth();

  let token: string | null | undefined;
  try {
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    token = tokenResp.token;
  } catch (err) {
    throw new PubSubAuthError('failed to obtain access token', err);
  }
  if (!token) {
    throw new PubSubAuthError('access token returned empty');
  }

  const url = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${opts.topic}:publish`;
  const body = {
    messages: [
      {
        data: Buffer.from(JSON.stringify(opts.message)).toString('base64'),
        ...(opts.attributes ? { attributes: opts.attributes } : {})
      }
    ]
  };

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const errorText = await response.text();
    throw new PubSubPublishError(opts.topic, response.status, errorText);
  }

  const result = (await response.json()) as { messageIds?: string[] };
  const messageId = result.messageIds?.[0];
  if (!messageId) {
    throw new PubSubPublishError(opts.topic, response.status, 'response missing messageId');
  }

  return { messageId, latencyMs };
}
