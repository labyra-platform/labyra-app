/**
 * POST /api/onboarding/accept — accept an invite, granting claims.
 *
 * Body: { tenantId: string, inviteId: string }
 *
 * Bare auth + email-match verification inside service. After success, the
 * client must call refreshAuthClaims() to pull the new {tenantId, role}.
 *
 * @phase ONBOARD-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateBare } from '@/lib/api/auth-bare';
import { acceptInvite } from '@/lib/firebase/invites/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const AcceptSchema = z.object({
  tenantId: z.string().min(1).max(128),
  inviteId: z.string().min(1).max(128)
});

export async function POST(req: NextRequest) {
  const auth = await authenticateBare(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('invite-accept', auth.uid), 10, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  let parsed;
  try {
    parsed = AcceptSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  try {
    const result = await acceptInvite(parsed.inviteId, parsed.tenantId, auth.uid, auth.email);
    return NextResponse.json({ ok: true, tenantId: result.tenantId, role: result.role });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'accept_failed';
    const status =
      msg === 'invite_not_found'
        ? 404
        : msg === 'email_mismatch'
          ? 403
          : msg === 'invite_expired' || msg === 'invite_not_pending'
            ? 409
            : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
