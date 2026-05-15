/**
 * Next.js instrumentation hook — wires paper processing pipeline at boot.
 *
 * Runs once when server starts (Vercel cold start or `pnpm dev`).
 * Registers the orchestrator as the job processor for InProcessQueue, so
 * /api/papers/upload POST → enqueue(job) → orchestrator runs.
 *
 * Without this file, InProcessQueue.enqueue() throws:
 *   "InProcessQueue: processor not registered. Call setJobProcessor() first."
 *
 * @phase R165-phase-5-ai5b-wire (ai-5b)
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only register in server runtime (Node.js), not Edge runtime.
  // process.env.NEXT_RUNTIME is 'nodejs' | 'edge' | undefined.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const { setJobProcessor } = await import('@/lib/ai/rag/jobs/in-process');
    const { processPaperJob } = await import('@/lib/ai/rag/pipeline/orchestrator');
    setJobProcessor(processPaperJob);
    // eslint-disable-next-line no-console -- one-time boot log
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'instrumentation_registered',
        phase: 'R165-phase-5-ai5b-wire',
        processor: 'processPaperJob'
      })
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- boot failure visibility
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'instrumentation_register_failed',
        phase: 'R165-phase-5-ai5b-wire',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    // Don't throw — let server boot even if RAG pipeline init fails.
    // Upload routes will surface the error per-request.
  }
}
