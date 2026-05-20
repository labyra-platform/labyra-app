/**
 * GET /api/onboarding/pending — list pending invites for the caller's email.
 *
 * Bare auth (orphan users have no tenantId yet). Email comes from the verified
 * token, never from query — prevents enumerating other users' invites.
 *
 * @phase ONBOARD-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateBare } from '@/lib/api/auth-bare';
import { findPendingInvitesByEmail } from '@/lib/firebase/invites/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateBare(req);
  if (auth.error) return auth.error;
  try {
    const invites = await findPendingInvitesByEmail(auth.email);
    // Strip invitedBy uid from client payload — not needed, avoids leaking.
    const items = invites.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      role: i.role,
      expiresAt: i.expiresAt
    }));
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/onboarding/pending', err);
    return new NextResponse('lookup_failed', { status: 500 });
  }
}
