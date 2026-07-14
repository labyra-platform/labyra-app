/**
 * POST /api/papers/[id]/share — change a paper's sharing scope.
 * Body { target: 'group' } (default) claims it into the caller's group;
 * { target: 'lab' } shares it lab-wide; { target: 'unshare' } reverts lab-wide
 * back to the paper's previous group (R488). Sets paper.groupId + re-stamps vector
 * metadata. Owner or admin/superadmin only. @phase R287, R486
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateWriter } from '@/lib/api/auth-helper';
import { shareToGroup, unshareFromLab } from '@/lib/firebase/papers/share';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateWriter(req);
  if (auth.error) return auth.error;

  // R486/R488: optional body { target: 'lab' | 'group' | 'unshare' }. 'group'
  // (default, matches pre-R486 callers sending no body) claims the paper into
  // the caller's group; 'lab' shares it lab-wide; 'unshare' reverts a lab-wide
  // paper to its previous group (falling back to the caller's group).
  let target: 'lab' | 'group' | 'unshare' = 'group';
  try {
    const body = (await req.json()) as { target?: string } | null;
    if (body?.target === 'lab' || body?.target === 'unshare') target = body.target;
    else if (body?.target !== undefined && body?.target !== 'group') {
      return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
    }
  } catch {
    // No/invalid JSON body — keep default 'group'.
  }

  if (target === 'group' && !auth.groupId) {
    return NextResponse.json({ error: 'no_group' }, { status: 400 });
  }
  const rl = await checkRateLimit(rateLimitKey('papers-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { id } = await ctx.params;
  try {
    const actor = { uid: auth.uid, role: auth.role };
    const paper =
      target === 'unshare'
        ? await unshareFromLab(auth.tenantId, id, actor, auth.groupId)
        : await shareToGroup(
            auth.tenantId,
            id,
            target === 'lab' ? 'lab-shared' : (auth.groupId as string),
            actor
          );
    return NextResponse.json(paper);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'share_failed';
    if (msg === 'not_found') return new NextResponse('not_found', { status: 404 });
    if (msg === 'forbidden') return new NextResponse('forbidden', { status: 403 });
    if (msg === 'no_group') return NextResponse.json({ error: 'no_group' }, { status: 400 });
    console.error('POST /api/papers/[id]/share', err);
    return new NextResponse('share_failed', { status: 500 });
  }
}
