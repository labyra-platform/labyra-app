/**
 * POST /api/invites — admin creates an invite.
 * GET  /api/invites — admin lists tenant invites.
 *
 * ADR-031: anti-escalation — admin cannot invite 'admin'; only superadmin can.
 *
 * @phase ONBOARD-1
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate, authenticateAdmin, authenticateWriter } from '@/lib/api/auth-helper';
import { createInvite, listInvites } from '@/lib/firebase/invites/service';
import { sendInviteEmail } from '@/lib/email/send-invite';
import { getAdminFirestoreService } from '@/lib/firebase/admin';
import { CreateInviteSchema } from '@/lib/schemas/invite-schema';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ADR-034 TEAM-2: admins OR group leaders may create invites. authenticateWriter
  // admits member-role leaders; the body below enforces the leader restrictions.
  const auth = await authenticateWriter(req);
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

  // Anti-escalation tier 1 (admin/superadmin): only superadmin may invite 'admin'.
  if (parsed.role === 'admin' && auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'forbidden_invite_admin' }, { status: 403 });
  }

  // ADR-034 TEAM-2: group leaders (isGroupLead) may invite into THEIR group only,
  // and only as member/viewer. Non-admins who are not group leads cannot invite.
  const isTenantAdmin = auth.role === 'admin' || auth.role === 'superadmin';
  if (!isTenantAdmin) {
    if (!auth.isGroupLead || !auth.groupId) {
      return NextResponse.json({ error: 'forbidden_not_admin' }, { status: 403 });
    }
    if (parsed.role === 'admin') {
      return NextResponse.json({ error: 'forbidden_lead_invite_admin' }, { status: 403 });
    }
    // Force the invite into the leader's own group — ignore any client groupId.
    parsed.groupId = auth.groupId;
  }

  try {
    const invite = await createInvite(auth.tenantId, parsed, auth.uid);

    // Best-effort invite email — MUST NOT block or fail invite creation.
    // Notification is decoupled from authorization (email-match still governs join).
    void (async () => {
      try {
        const tenantSnap = await getAdminFirestoreService().doc(`tenants/${auth.tenantId}`).get();
        const tenantName =
          (tenantSnap.data() as { name?: string } | undefined)?.name ?? auth.tenantId;
        await sendInviteEmail({ to: invite.email, tenantName, role: invite.role });
      } catch (e) {
        console.warn('invite email dispatch failed (non-fatal):', e);
      }
    })();

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
