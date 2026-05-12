/**
 * Job queue abstraction.
 * @phase R160-ai-5b-1
 */
import 'server-only';
import { InProcessQueue } from './in-process';
import type { JobQueue } from './types';

let _queue: JobQueue | null = null;

export function getJobQueue(): JobQueue {
  if (_queue) return _queue;
  _queue = new InProcessQueue();
  return _queue;
}

export { setJobProcessor } from './in-process';
export type { JobQueue, PaperProcessingJob } from './types';
