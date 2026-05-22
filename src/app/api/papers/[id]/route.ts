/**
 * /api/papers/[id] — read, update, deprecate a paper.
 *
 * @phase R164-phase-4b
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateWriter } from '@/lib/api/auth-helper';
import { deprecatePaper, getPaper, updatePaperMetadata } from '@/lib/firebase/papers/service';
import { UpdatePaperMetadataSchema } from '@/lib/schemas/paper-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-read', auth.tenantId), 100, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const item = await getPaper(auth.tenantId, id);
  if (!item) return new NextResponse('not_found', { status: 404 });

  // ADR-034 TEAM-4a: group scope. Non-privileged viewers may only read papers
  // in their own group or lab-shared. 404 (not 403) to avoid leaking existence.
  const isPrivileged = auth.role === 'admin' || auth.role === 'superadmin';
  if (!isPrivileged && item.groupId !== 'lab-shared' && item.groupId !== auth.groupId) {
    return new NextResponse('not_found', { status: 404 });
  }
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = UpdatePaperMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updatePaperMetadata(id, parsed.data, {
      tenantId: auth.tenantId,
      updatedBy: auth.uid,
      changeNote: req.headers.get('x-change-note') ?? undefined
    });
    if (!updated) return new NextResponse('not_found', { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/papers/[id]', err);
    return new NextResponse('update_failed', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  const { id } = await ctx.params;
  const reason = req.nextUrl.searchParams.get('reason') ?? undefined;

  try {
    await deprecatePaper(id, auth.tenantId, auth.uid, reason);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/papers/[id]', err);
    return new NextResponse('deprecate_failed', { status: 500 });
  }
}
