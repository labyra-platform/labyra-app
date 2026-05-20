/**
 * POST /api/csie/[sampleId]/refresh
 *
 * R186-4: publishes to the 'csie-trigger' Pub/Sub topic instead of calling the
 * worker over HTTP. The worker (/csie/process push subscriber) computes CSIE and
 * writes samples/{sampleId}/crossSpectrum/latest; the UI's useCSIEResult
 * onSnapshot listener updates live. Returns 202 Accepted (async).
 *
 * Body: { force?: boolean }
 *
 * @phase R185-10c (HTTP) → R186-4 (Pub/Sub)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { publishCsieTrigger } from '@/lib/pubsub/topics/csie-trigger';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ sampleId: string }> }) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const { sampleId } = await context.params;
  if (!sampleId || !/^[A-Za-z0-9_-]{1,128}$/.test(sampleId)) {
    return new NextResponse('invalid_sample_id', { status: 400 });
  }

  const rl = await checkRateLimit(rateLimitKey('csie-refresh', auth.tenantId), 10, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body.force);

  try {
    const messageId = await publishCsieTrigger({
      tenantId: auth.tenantId,
      sampleId,
      force
    });
    return NextResponse.json({ status: 'queued', messageId }, { status: 202 });
  } catch (err) {
    console.error('CSIE trigger publish failed', err);
    return new NextResponse('csie_enqueue_failed', { status: 502 });
  }
}
