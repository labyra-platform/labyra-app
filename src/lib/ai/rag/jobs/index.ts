/**
 * Job queue abstraction with backend selection.
 * @phase R160-ai-5b-1
 * @phase R167-C — added PubSubQueue + env switch
 *
 * Backend selection via PAPER_QUEUE_BACKEND env:
 *   - 'pubsub' → PubSubQueue (worker handles pipeline, see ADR-018)
 *   - 'in-process' (or unset) → InProcessQueue (TS orchestrator inline)
 *
 * Rollback: flip env var, no code change needed.
 */
import 'server-only';
import { InProcessQueue } from './in-process';
import { PubSubQueue } from '@/lib/pubsub/topics/paper-processing'; // R168-3.1b
import type { JobQueue } from './types';

let _queue: JobQueue | null = null;
let _processorEnsured = false;

function selectedBackend(): 'pubsub' | 'in-process' {
  const v = (process.env.PAPER_QUEUE_BACKEND ?? '').toLowerCase().trim();
  return v === 'pubsub' ? 'pubsub' : 'in-process';
}

/**
 * Lazy-load processor module to register it.
 * Only relevant for InProcessQueue — PubSubQueue delegates to external worker.
 */
async function ensureProcessor(): Promise<void> {
  if (_processorEnsured) return;
  _processorEnsured = true;
  // Dynamic import to avoid circular deps and force same module instance
  const { registerPaperProcessor } = await import('@/lib/ai/rag/pipeline');
  registerPaperProcessor();
}

export async function getJobQueue(): Promise<JobQueue> {
  if (_queue) return _queue;

  const backend = selectedBackend();
  if (backend === 'pubsub') {
    // Worker (Python Cloud Run) handles pipeline — don't register TS processor
    _queue = new PubSubQueue();
  } else {
    await ensureProcessor();
    _queue = new InProcessQueue();
  }
  return _queue;
}

export { setJobProcessor } from './in-process';
export { requestPaperCancellation } from '@/lib/pubsub/topics/paper-processing'; // R168-3.1b
export type { JobQueue, PaperProcessingJob } from './types';
