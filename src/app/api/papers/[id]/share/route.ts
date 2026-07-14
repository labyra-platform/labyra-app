/**
 * POST /api/papers/[id]/share — change a paper's sharing scope.
 * Body { target: 'group' } (default) claims it into the caller's group;
 * { target: 'lab' } shares it lab-wide. Sets paper.groupId + re-stamps vector
 * metadata. Owner or admin/superadmin only. @phase R287, R486
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

  // R486: optional body { target: 'lab' | 'group' }. 'group' (default, matches
  // pre-R486 callers sending no body) claims the paper into the caller's group;
  // 'lab' shares it lab-wide (groupId = 'lab-shared').
  let target: 'lab' | 'group' = 'group';
  try {
    const body = (await req.json()) as { target?: string } | null;
    if (body?.target === 'lab') target = 'lab';
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
    const targetGroupId = target === 'lab' ? 'lab-shared' : (auth.groupId as string);
    const paper = await shareToGroup(auth.tenantId, id, targetGroupId, {
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
