/**
 * POST /api/papers/[id]/reactivate — undo deprecation.
 *
 * @phase R164-phase-4b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateWriter } from '@/lib/api/auth-helper';
import { reactivatePaper } from '@/lib/firebase/papers/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-reactivate', auth.tenantId), 10, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  try {
    await reactivatePaper(id, auth.tenantId, auth.uid);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg.includes('Cannot reactivate retracted')) {
      return new NextResponse(msg, { status: 409 });
    }
    console.error('POST /api/papers/[id]/reactivate', err);
    return new NextResponse('reactivate_failed', { status: 500 });
  }
}
