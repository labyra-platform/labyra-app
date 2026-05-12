/**
 * InProcessQueue — Stage 1 implementation.
 * Stores AbortControllers keyed by jobId. Triggers processor without await.
 * @phase R160-ai-5b-1
 *
 * NOTE: This is single-instance only (Vercel cold starts reset state).
 * Acceptable for Stage 1 since:
 *   - Status persisted in Firestore (recoverable)
 *   - Low volume (< 10 papers/day)
 *   - Retry logic in processor handles dropped jobs
 *
 * Migration to PubSubQueue (Stage 2) preserves this interface.
 */
import 'server-only';
import type { JobQueue, PaperProcessingJob } from './types';

const activeJobs = new Map<string, AbortController>();

// Processor function injected to avoid circular imports
type Processor = (job: PaperProcessingJob, signal: AbortSignal) => Promise<void>;
let processorFn: Processor | null = null;

export function setJobProcessor(fn: Processor): void {
  processorFn = fn;
}

export class InProcessQueue implements JobQueue {
  readonly id = 'in-process';

  async enqueue(job: PaperProcessingJob): Promise<void> {
    if (!processorFn) {
      throw new Error('InProcessQueue: processor not registered. Call setJobProcessor() first.');
    }

    if (activeJobs.has(job.jobId)) {
      // Idempotent: already running
      return;
    }

    const controller = new AbortController();
    activeJobs.set(job.jobId, controller);

    // Fire-and-forget: do not await. Errors handled inside processor.
    void (async () => {
      try {
        await processorFn!(job, controller.signal);
      } catch (err) {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'job_processor_uncaught',
            jobId: job.jobId,
            paperId: job.paperId,
            tenantId: job.tenantId,
            error: err instanceof Error ? err.message : String(err)
          })
        );
      } finally {
        activeJobs.delete(job.jobId);
      }
    })();
  }

  async cancel(jobId: string): Promise<void> {
    const controller = activeJobs.get(jobId);
    if (controller) {
      controller.abort();
    }
    // No-op if not active (may have completed or never started in this instance)
  }

  isActive(jobId: string): boolean {
    return activeJobs.has(jobId);
  }
}
