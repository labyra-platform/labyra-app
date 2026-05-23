/**
 * POST /api/materials/[id]/reactivate — undo deprecation.
 *
 * Cannot reactivate retracted entities (per ADR-016).
 *
 * @phase R164-phase-4a
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateWriter } from '@/lib/api/auth-helper';
import { reactivateMaterial } from '@/lib/firebase/materials/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('materials-reactivate', auth.tenantId), 10, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;

  try {
    await reactivateMaterial(id, auth.tenantId, auth.uid);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg.includes('Cannot reactivate retracted')) {
      return new NextResponse(msg, { status: 409 });
    }
    console.error('POST /api/materials/[id]/reactivate', err);
    return new NextResponse('reactivate_failed', { status: 500 });
  }
}
