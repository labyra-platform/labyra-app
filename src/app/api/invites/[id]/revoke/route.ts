/**
 * POST /api/invites/[id]/revoke — admin revokes a pending invite.
 *
 * @phase ONBOARD-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/api/auth-helper';
import { revokeInvite } from '@/lib/firebase/invites/service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    await revokeInvite(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'revoke_failed';
    const status = msg === 'invite_not_found' ? 404 : msg === 'invite_not_pending' ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
