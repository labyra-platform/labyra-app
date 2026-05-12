/**
 * Job queue interface — future-proof scaffolding.
 * @phase R160-ai-5b-1
 *
 * Stage 1: InProcessQueue (in-memory AbortController map).
 * Stage 2 future: PubSubQueue (GCP PubSub) — swap impl, same interface.
 */

export interface PaperProcessingJob {
  jobId: string;
  paperId: string;
  tenantId: string;
  version: number;
  enqueuedAt: number;
}

export interface JobQueue {
  readonly id: string;
  /** Enqueue a job for processing. Returns when accepted by queue. */
  enqueue(job: PaperProcessingJob): Promise<void>;
  /** Request cancellation of a running job. */
  cancel(jobId: string): Promise<void>;
  /** Check if a job is currently active (Stage 1 only — Stage 2 uses Firestore flag). */
  isActive(jobId: string): boolean;
}
