/**
 * Next.js instrumentation — runs once at server startup.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerPaperProcessor } = await import('@/lib/ai/rag/pipeline');
    registerPaperProcessor();
  }
}
