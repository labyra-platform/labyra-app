/**
 * GET /api/groups/my/members — members of the caller's own research group.
 *
 * Any authenticated tenant member (viewer+) may call. The group is taken from
 * the caller's groupId claim — never from the request — so a member can only
 * ever see their own group (ADR-034 group scope). Admin-wide listing stays in
 * GET /api/members (admin-gated).
 *
 * @phase R485 — unified settings (Group tab)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/api/auth-helper';
import { getGroup } from '@/lib/firebase/groups/service';
import { listGroups } from '@/lib/firebase/groups/service';
import { listTenantMembers } from '@/lib/firebase/members/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.error) return auth.error;

  const rl = await checkRateLimit(rateLimitKey('groups-read', auth.tenantId), 60, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', { status: 429 });
  }

  // R506: a lab head oversees every group, so admins may aim this at any group
  // via ?groupId=. For everyone else the parameter is ignored outright — scope
  // still comes from the claim, never from the request.
  const isAdmin = auth.role === 'admin' || auth.role === 'superadmin';
  const requested = req.nextUrl.searchParams.get('groupId')?.trim() || null;
  const scopeGroupId = isAdmin && requested ? requested : auth.groupId;

  if (!scopeGroupId && !isAdmin) {
    return NextResponse.json({ group: null, items: [], groups: [] });
  }

  try {
    const [group, members, allGroups] = await Promise.all([
      scopeGroupId ? getGroup(auth.tenantId, scopeGroupId) : Promise.resolve(null),
      listTenantMembers(auth.tenantId),
      // Only a lab head gets the group list — it's what populates their picker.
      isAdmin ? listGroups(auth.tenantId) : Promise.resolve([])
    ]);
    const effectiveGroupId = scopeGroupId ?? allGroups[0]?.id ?? null;
    const items = members
      .filter((m) => m.groupId === effectiveGroupId && !m.disabled)
      .map((m) => ({
        uid: m.uid,
        displayName: m.displayName,
        email: m.email,
        role: m.role,
        isGroupLead: m.isGroupLead
      }))
      .toSorted((a, b) =>
        a.isGroupLead !== b.isGroupLead
          ? Number(b.isGroupLead) - Number(a.isGroupLead)
          : (a.displayName || a.email).localeCompare(b.displayName || b.email)
      );
    return NextResponse.json({
      group: group
        ? { id: group.id, name: group.name }
        : effectiveGroupId
          ? { id: effectiveGroupId, name: '' }
          : null,
      items,
      groups: allGroups.map((g) => ({ id: g.id, name: g.name })),
      canSwitchGroup: isAdmin
    });
  } catch (err) {
    console.error('GET /api/groups/my/members', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}
