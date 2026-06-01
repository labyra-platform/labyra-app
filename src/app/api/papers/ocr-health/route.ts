/**
 * OCR runtime health — reveals the ACTUAL runtime OCR config so engine/env issues
 * are diagnosable from the browser (no paper upload, no log digging).
 *
 * GET /api/papers/ocr-health?secret=<CRON_SECRET>
 *
 * @phase R261 (diagnostic)
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { resolveOcrEngine } from '@/lib/ai/rag/ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // always read current env, never cache

export function GET(request: Request): NextResponse {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let selectedEngine: string | null = null;
  let resolveError: string | null = null;
  try {
    selectedEngine = resolveOcrEngine(process.env.OCR_ENGINE).id;
  } catch (error) {
    resolveError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    requestedEngine: process.env.OCR_ENGINE ?? null,
    fallbackRaw: process.env.OCR_FALLBACK ?? null,
    selectedEngine,
    resolveError,
    datalabKeyPresent: Boolean(process.env.DATALAB_API_KEY),
    mistralKeyPresent: Boolean(process.env.MISTRAL_API_KEY),
    paperQueueBackend: process.env.PAPER_QUEUE_BACKEND ?? null,
    checkedAt: new Date().toISOString()
  });
}
