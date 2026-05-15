/**
 * PubSubQueue — Stage 2 implementation.
 * Publishes paper processing jobs to GCP Pub/Sub topic.
 * Worker (labyra-spectra-worker) subscribes via push subscription.
 *
 * @phase R167-C
 * @see docs/adr/ADR-018-async-worker-architecture.md
 */
import 'server-only';
import { PubSub } from '@google-cloud/pubsub';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import type { JobQueue, PaperProcessingJob } from './types';

const DEFAULT_TOPIC = 'paper-processing';

// Singleton client via globalThis (Next.js module isolation safety)
type GlobalState = {
  __labyraPubsubClient?: PubSub;
};
const globalState = globalThis as unknown as GlobalState;

function getClient(): PubSub {
  if (globalState.__labyraPubsubClient) return globalState.__labyraPubsubClient;
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error('PubSubQueue: GCP_PROJECT_ID env not set');
  }
  globalState.__labyraPubsubClient = new PubSub({ projectId });
  return globalState.__labyraPubsubClient;
}

function getTopicName(): string {
  return process.env.PUBSUB_PAPER_TOPIC ?? DEFAULT_TOPIC;
}

export class PubSubQueue implements JobQueue {
  readonly id = 'pubsub';

  async enqueue(job: PaperProcessingJob): Promise<void> {
    const topicName = getTopicName();
    const topic = getClient().topic(topicName);

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

    try {
      const messageId = await topic.publishMessage({
        json: messageBody
      });
      // eslint-disable-next-line no-console -- structured audit log
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'pubsub_paper_enqueued',
          jobId: job.jobId,
          paperId: job.paperId,
          tenantId: job.tenantId,
          messageId,
          topic: topicName
        })
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'pubsub_paper_enqueue_failed',
          jobId: job.jobId,
          paperId: job.paperId,
          topic: topicName,
          error: err instanceof Error ? err.message : String(err)
        })
      );
      throw err;
    }
  }

  async cancel(jobId: string): Promise<void> {
    // Pub/Sub has no "cancel published message" API.
    // Cancellation is signaled via Firestore paper.cancelRequestedAt — worker
    // polls this between pipeline steps (see worker src/papers/state.py).
    //
    // This method is a no-op for jobId-based cancellation. Callers should
    // use /api/papers/[id]/cancel route which writes cancelRequestedAt directly.
    //
    // We log for observability — if this is hit, there's likely a code path
    // calling queue.cancel(jobId) that needs migration to use the cancel route.
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
    // Pub/Sub queue doesn't track in-flight messages by jobId from publisher side.
    // Worker side tracks via Firestore status field (queued | ocr | ... | indexed).
    //
    // For UI "is paper being processed" check, query Firestore paper.status
    // directly. Always return false here to indicate no in-memory tracking.
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
