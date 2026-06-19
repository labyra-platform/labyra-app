/**
 * PATCH /api/members/[uid] — move a member to a different group (admin/superadmin).
 * Body: { groupId: string }. Rewrites the member's groupId custom claim; they
 * must re-authenticate for it to take effect. @phase R285 (ADR-034 TEAM-4)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/api/auth-helper';
import { moveMemberToGroup } from '@/lib/firebase/members/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ uid: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('members-write', auth.tenantId), 30, 60);
  if (!rl.allowed) return new NextResponse('rate_limited', { status: 429 });

  const { uid } = await ctx.params;
  let body: { groupId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  if (!groupId) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    const member = await moveMemberToGroup(auth.tenantId, uid, groupId);
    return NextResponse.json(member);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'move_failed';
    if (msg === 'member_not_in_tenant' || msg === 'group_not_found') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('PATCH /api/members/[uid]', err);
    return new NextResponse('move_failed', { status: 500 });
  }
}
