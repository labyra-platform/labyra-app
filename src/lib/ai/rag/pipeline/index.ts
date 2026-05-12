/**
 * Pipeline registration — wires processor to job queue.
 * @phase R160-ai-5b-2
 */
import 'server-only';
import { setJobProcessor } from '@/lib/ai/rag/jobs';
import { processPaperJob } from './orchestrator';

let _registered = false;

export function registerPaperProcessor(): void {
  if (_registered) return;
  setJobProcessor(processPaperJob);
  _registered = true;
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'paper_processor_registered',
      ts: new Date().toISOString()
    })
  );
}
