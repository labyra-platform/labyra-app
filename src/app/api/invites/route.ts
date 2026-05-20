/**
 * POST /api/invites — admin creates an invite.
 * GET  /api/invites — admin lists tenant invites.
 *
 * ADR-031: anti-escalation — admin cannot invite 'admin'; only superadmin can.
 *
 * @phase ONBOARD-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateAdmin } from '@/lib/api/auth-helper';
import { createInvite, listInvites } from '@/lib/firebase/invites/service';
import { CreateInviteSchema } from '@/lib/schemas/invite-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('invite-create', auth.tenantId), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }

  let parsed;
  try {
    parsed = CreateInviteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Anti-escalation: only superadmin may invite an 'admin'.
  if (parsed.role === 'admin' && auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'forbidden_invite_admin' }, { status: 403 });
  }

  try {
    const invite = await createInvite(auth.tenantId, parsed, auth.uid);
    return NextResponse.json(invite, { status: 201 });
  } catch (err) {
    console.error('POST /api/invites', err);
    return new NextResponse('create_failed', { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  try {
    const items = await listInvites(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/invites', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}
