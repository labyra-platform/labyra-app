/**
 * /api/experiments/[id] — read, update, deprecate (soft delete) a experiment.
 *
 * DELETE here = deprecate (lifecycleStatus → 'deprecated').
 * For scientific retraction, use POST /api/experiments/[id]/retract.
 *
 * @phase R164-phase-4a
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import {
  deprecateExperiment,
  getExperiment,
  updateExperiment
} from '@/lib/firebase/experiments/service';
import { UpdateExperimentSchema } from '@/lib/schemas/experiment-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('experiments-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const item = await getExperiment(auth.tenantId, id);
  if (!item) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('experiments-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = UpdateExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateExperiment(id, parsed.data, {
      tenantId: auth.tenantId,
      updatedBy: auth.uid
    });
    if (!updated) return new NextResponse('not_found', { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/experiments/[id]', err);
    return new NextResponse('update_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('experiments-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get('reason') ?? undefined;

  try {
    await deprecateExperiment(id, auth.tenantId, auth.uid, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/experiments/[id]', err);
    return new NextResponse('deprecate_failed', { status: 500 });
  }
}
