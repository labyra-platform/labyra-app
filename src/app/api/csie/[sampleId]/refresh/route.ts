/**
 * POST /api/csie/[sampleId]/refresh
 *
 * Proxies to worker /csie/{sampleId}/refresh. Validates auth + rate limit.
 *
 * Body: { tenantId: string, force?: boolean }
 *
 * @phase R185-10c
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest, context: { params: Promise<{ sampleId: string }> }) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const { sampleId } = await context.params;
  if (!sampleId || !/^[A-Za-z0-9_\-]{1,128}$/.test(sampleId)) {
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

  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || process.env.SPECTRA_WORKER_URL;
  if (!workerUrl) {
    return new NextResponse('worker_url_not_configured', { status: 500 });
  }

  try {
    // OIDC token via service account for Cloud Run (worker-side validation)
    // Worker accepts both Firebase tokens (for user actions) and SA tokens (Pub/Sub push).
    const res = await fetch(`${workerUrl}/csie/${encodeURIComponent(sampleId)}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: auth.tenantId, force })
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' }
    });
  } catch (err) {
    console.error('CSIE refresh proxy failed', err);
    return new NextResponse('worker_unreachable', { status: 502 });
  }
}
