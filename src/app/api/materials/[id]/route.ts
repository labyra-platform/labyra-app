/**
 * /api/materials/[id] — read, update, deprecate (soft delete) a material.
 *
 * DELETE here = deprecate (lifecycleStatus → 'deprecated').
 * For scientific retraction, use POST /api/materials/[id]/retract.
 *
 * @phase R164-phase-4a
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { deprecateMaterial, getMaterial, updateMaterial } from '@/lib/firebase/materials/service';
import { UpdateMaterialSchema } from '@/lib/schemas/material-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('materials-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const item = await getMaterial(auth.tenantId, id);
  if (!item) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('materials-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = UpdateMaterialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateMaterial(id, parsed.data, {
      tenantId: auth.tenantId,
      updatedBy: auth.uid
    });
    if (!updated) return new NextResponse('not_found', { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/materials/[id]', err);
    return new NextResponse('update_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('materials-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get('reason') ?? undefined;

  try {
    await deprecateMaterial(id, auth.tenantId, auth.uid, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/materials/[id]', err);
    return new NextResponse('deprecate_failed', { status: 500 });
  }
}
