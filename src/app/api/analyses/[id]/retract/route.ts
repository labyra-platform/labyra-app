/**
 * POST /api/analyses/[id]/retract — scientific retraction (immutable).
 *
 * @phase R164-phase-4b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/lib/api/auth-helper';
import { retractAnalysis } from '@/lib/firebase/analyses/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const RetractBodySchema = z.object({
  reason: z.string().min(1).max(500)
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-retract', auth.tenantId), 10, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = RetractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await retractAnalysis(id, auth.tenantId, auth.uid, parsed.data.reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('POST /api/analyses/[id]/retract', err);
    return new NextResponse('retract_failed', { status: 500 });
  }
}
