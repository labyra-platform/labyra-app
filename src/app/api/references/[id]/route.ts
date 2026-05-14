/**
 * /api/references/[id] — read, update, deprecate a reference.
 *
 * @phase R164-phase-4b
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';
import {
  getReference,
  updateReference,
  deprecateReference
} from '@/lib/firebase/references/service';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('references-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const item = await getReference(auth.tenantId, id);
  if (!item) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('references-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = { success: true, data: body } as const;

  try {
    const updated = await updateReference(id, parsed.data, {
      tenantId: auth.tenantId,
      updatedBy: auth.uid,
      changeNote: req.headers.get('x-change-note') ?? undefined
    });
    if (!updated) return new NextResponse('not_found', { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/references/[id]', err);
    return new NextResponse('update_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('references-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get('reason') ?? undefined;

  try {
    await deprecateReference(id, auth.tenantId, auth.uid, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/references/[id]', err);
    return new NextResponse('deprecate_failed', { status: 500 });
  }
}
