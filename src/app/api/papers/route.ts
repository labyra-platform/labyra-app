/**
 * /api/papers — list papers.
 *
 * @phase R164-phase-4b
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { listPapers } from '@/lib/firebase/papers/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  const includeDeprecated = req.nextUrl.searchParams.get('includeDeprecated') === 'true';
  const includeRetracted = req.nextUrl.searchParams.get('includeRetracted') === 'true';
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : undefined;

  try {
    const items = await listPapers(auth.tenantId, { includeDeprecated, includeRetracted, limit });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/papers', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}
