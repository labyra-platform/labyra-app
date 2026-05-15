/**
 * PubSubQueue — Stage 2 implementation using REST API.
 *
 * Publishes paper processing jobs to GCP Pub/Sub topic via HTTPS REST.
 * Avoids gRPC issues with @google-cloud/pubsub SDK on Vercel serverless
 * (matches pattern in src/lib/pubsub/publisher.ts for spectra).
 *
 * Worker (labyra-spectra-worker) subscribes via push subscription.
 *
 * @phase R167-C / hotfix R167-C2 (REST rewrite)
 * @see docs/adr/ADR-018-async-worker-architecture.md
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { getAuth } from '@/lib/pubsub/publisher';
import type { JobQueue, PaperProcessingJob } from './types';

const DEFAULT_TOPIC = 'paper-processing';

function getTopicName(): string {
  return process.env.PUBSUB_PAPER_TOPIC ?? DEFAULT_TOPIC;
}

function getProjectId(): string {
  const pid = process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!pid) {
    throw new Error('PubSubQueue: GCP_PROJECT_ID not configured');
  }
  return pid;
}

export class PubSubQueue implements JobQueue {
  readonly id = 'pubsub';

  async enqueue(job: PaperProcessingJob): Promise<void> {
    const projectId = getProjectId();
    const topic = getTopicName();

    // ADR-018 message shape — keys MUST match worker Pydantic PaperJob model
    const messageBody = {
      jobId: job.jobId,
      tenantId: job.tenantId,
      paperId: job.paperId,
      version: job.version,
      storagePath: job.storagePath,
      createdBy: job.createdBy,
      enqueuedAt: job.enqueuedAt
    };

    // Get auth token (reuses publisher.ts singleton)
    const auth = getAuth();
    const client = await auth.getClient();
    const tokenResp = await client.getAccessToken();
    if (!tokenResp.token) {
      throw new Error('PubSubQueue: failed to obtain access token');
    }

    const url = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topic}:publish`;
    const body = {
      messages: [
        {
          data: Buffer.from(JSON.stringify(messageBody)).toString('base64'),
          attributes: {
            tenantId: job.tenantId,
            paperId: job.paperId
          }
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResp.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(
        `pubsub_paper_enqueue_failed ${response.status}: ${errorText.substring(0, 300)}`
      );
      // eslint-disable-next-line no-console -- structured audit log
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'pubsub_paper_enqueue_failed',
          jobId: job.jobId,
          paperId: job.paperId,
          tenantId: job.tenantId,
          topic,
          httpStatus: response.status,
          error: errorText.substring(0, 300)
        })
      );
      throw err;
    }

    const result = (await response.json()) as { messageIds?: string[] };
    const messageId = result.messageIds?.[0];
    if (!messageId) {
      throw new Error('PubSubQueue: response missing messageId');
    }

    // eslint-disable-next-line no-console -- structured audit log
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'pubsub_paper_enqueued',
        jobId: job.jobId,
        paperId: job.paperId,
        tenantId: job.tenantId,
        messageId,
        topic
      })
    );
  }

  async cancel(jobId: string): Promise<void> {
    // Pub/Sub has no "cancel published message" API.
    // Cancellation is signaled via Firestore paper.cancelRequestedAt — worker
    // polls between pipeline steps (see worker src/papers/state.py).
    // eslint-disable-next-line no-console -- structured audit log
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'pubsub_cancel_noop',
        jobId,
        hint: 'use /api/papers/[id]/cancel route to set cancelRequestedAt'
      })
    );
  }

  isActive(jobId: string): boolean {
    // No publisher-side tracking. UI should query Firestore paper.status.
    void jobId;
    return false;
  }
}

/**
 * Touch paper to set cancelRequestedAt — preferred path for cancellation
 * when using PubSubQueue. Worker polls this field between pipeline steps.
 *
 * Exported helper so /api/papers/[id]/cancel route can use it directly.
 */
export async function requestPaperCancellation(tenantId: string, paperId: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
    cancelRequestedAt: Timestamp.now(),
    status: 'cancelling'
  });
}
