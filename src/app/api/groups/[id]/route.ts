/**
 * GET    /api/groups/[id] — detail (admin).
 * PATCH  /api/groups/[id] — rename / appoint leader (owner = admin/superadmin).
 * DELETE /api/groups/[id] — delete group (owner).
 * @phase TEAM-1 (ADR-034)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/api/auth-helper';
import { UpdateGroupSchema } from '@/lib/schemas/group-schema';
import { deleteGroup, getGroup, updateGroup } from '@/lib/firebase/groups/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const g = await getGroup(auth.tenantId, id);
  if (!g) return new NextResponse('not_found', { status: 404 });
  return NextResponse.json(g);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let patch;
  try {
    patch = UpdateGroupSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    await updateGroup(auth.tenantId, id, {
      name: patch.name,
      leaderId: patch.leaderId === null ? null : patch.leaderId
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'update_failed';
    const status = msg === 'group_not_found' ? 404 : msg === 'leader_not_in_tenant' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    await deleteGroup(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'delete_failed';
    return NextResponse.json({ error: msg }, { status: msg === 'group_not_found' ? 404 : 500 });
  }
}
