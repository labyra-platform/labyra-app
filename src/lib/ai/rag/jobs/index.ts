/**
 * Job queue abstraction.
 * @phase R160-ai-5b-1
 */
import 'server-only';
import { InProcessQueue } from './in-process';
import type { JobQueue } from './types';

let _queue: JobQueue | null = null;
let _processorEnsured = false;

/**
 * Lazy-load processor module to register it.
 * Workaround for Next.js Turbopack module isolation:
 * instrumentation may register into a different module instance.
 * Force-register here on first queue access.
 */
async function ensureProcessor(): Promise<void> {
  if (_processorEnsured) return;
  _processorEnsured = true;
  // Dynamic import to avoid circular deps and force same module instance
  const { registerPaperProcessor } = await import('@/lib/ai/rag/pipeline');
  registerPaperProcessor();
}

export async function getJobQueue(): Promise<JobQueue> {
  await ensureProcessor();
  if (_queue) return _queue;
  _queue = new InProcessQueue();
  return _queue;
}

export { setJobProcessor } from './in-process';
export type { JobQueue, PaperProcessingJob } from './types';
