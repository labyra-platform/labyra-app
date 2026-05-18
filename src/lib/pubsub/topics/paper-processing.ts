/**
 * Domain wrapper: paper processing topic + PubSubQueue implementation.
 *
 * Worker subscriber: labyra-spectra-worker /papers/process endpoint.
 * Topic: 'paper-processing' (override via PUBSUB_PAPER_TOPIC).
 *
 * @phase R168-3.1a (extracted from src/lib/ai/rag/jobs/pubsub.ts)
 * @see ADR-018 async worker architecture
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import type { JobQueue, PaperProcessingJob } from '@/lib/ai/rag/jobs/types';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { publishToTopic } from '../publish-to-topic';

const DEFAULT_TOPIC = 'paper-processing';

function getTopicName(): string {
  return process.env.PUBSUB_PAPER_TOPIC ?? DEFAULT_TOPIC;
}

/**
 * ADR-018 message shape — keys MUST match worker Pydantic PaperJob model.
 * Worker: labyra-spectra-worker src/papers/types.py
 */
interface PaperJobMessage {
  jobId: string;
  tenantId: string;
  paperId: string;
  version: number;
  storagePath: string;
  createdBy: string;
  enqueuedAt: number;
}

function jobToMessage(job: PaperProcessingJob): PaperJobMessage {
  return {
    jobId: job.jobId,
    tenantId: job.tenantId,
    paperId: job.paperId,
    version: job.version,
    storagePath: job.storagePath,
    createdBy: job.createdBy,
    enqueuedAt: job.enqueuedAt
  };
}

export class PubSubQueue implements JobQueue {
  readonly id = 'pubsub';

  async enqueue(job: PaperProcessingJob): Promise<void> {
    const topic = getTopicName();
    const message = jobToMessage(job);

    try {
      const { messageId, latencyMs } = await publishToTopic({
        topic,
        message,
        attributes: {
          tenantId: job.tenantId,
          paperId: job.paperId
        }
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
          latencyMs,
          topic
        })
      );
    } catch (err) {
      // eslint-disable-next-line no-console -- structured audit log
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'pubsub_paper_enqueue_failed',
          jobId: job.jobId,
          paperId: job.paperId,
          tenantId: job.tenantId,
          topic,
          error: err instanceof Error ? err.message : String(err)
        })
      );
      throw err;
    }
  }

  async cancel(jobId: string): Promise<void> {
    // Pub/Sub has no "cancel published message" API.
    // Cancellation is signaled via Firestore paper.cancelRequestedAt —
    // worker polls between pipeline steps (see worker src/papers/state.py).
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
    void jobId;
    return false;
  }
}

/**
 * Touch paper to set cancelRequestedAt — preferred cancellation path when
 * using PubSubQueue. Worker polls this field between pipeline steps.
 */
export async function requestPaperCancellation(tenantId: string, paperId: string): Promise<void> {
  const db = getAdminFirestoreService();
  await db.doc(`tenants/${tenantId}/papers/${paperId}`).update({
    cancelRequestedAt: Timestamp.now(),
    status: 'cancelling'
  });
}
