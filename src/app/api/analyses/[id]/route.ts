/**
 * /api/analyses/[id] — read, update, deprecate a analysis.
 *
 * @phase R164-phase-4b
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import { UpdateAnalysisSchema } from '@/lib/schemas/analysis-schema';
import { getAnalysis, updateAnalysis, deprecateAnalysis } from '@/lib/firebase/analyses/service';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const item = await getAnalysis(auth.tenantId, id);
  if (!item) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = UpdateAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateAnalysis(id, parsed.data, {
      tenantId: auth.tenantId,
      updatedBy: auth.uid
    });
    if (!updated) return new NextResponse('not_found', { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/analyses/[id]', err);
    return new NextResponse('update_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('analyses-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get('reason') ?? undefined;

  try {
    await deprecateAnalysis(id, auth.tenantId, auth.uid, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/analyses/[id]', err);
    return new NextResponse('deprecate_failed', { status: 500 });
  }
}
