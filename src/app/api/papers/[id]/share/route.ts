/**
 * POST /api/papers/[id]/share — share a paper into the caller's research group.
 * Sets paper.groupId to the caller's group + re-stamps vector metadata. Owner
 * or admin/superadmin only. @phase R287
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateWriter } from '@/lib/api/auth-helper';
import { shareToGroup } from '@/lib/firebase/papers/share';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;
  if (!auth.groupId) {
    return NextResponse.json({ error: 'no_group' }, { status: 400 });
  }
  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  try {
    const paper = await shareToGroup(auth.tenantId, id, auth.groupId, {
      uid: auth.uid,
      role: auth.role
    });
    return NextResponse.json(paper);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'share_failed';
    if (msg === 'not_found') return new NextResponse('not_found', { status: 404 });
    if (msg === 'forbidden') return new NextResponse('forbidden', { status: 403 });
    console.error('POST /api/papers/[id]/share', err);
    return new NextResponse('share_failed', { status: 500 });
  }
}
