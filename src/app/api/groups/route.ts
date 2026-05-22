/**
 * POST /api/groups — create a group (owner = tenant admin/superadmin).
 * GET  /api/groups — list tenant groups (admin).
 * @phase TEAM-1 (ADR-034)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/api/auth-helper';
import { CreateGroupSchema } from '@/lib/schemas/group-schema';
import { createGroup, listGroups } from '@/lib/firebase/groups/service';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  try {
    const items = await listGroups(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/groups', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  const rl = await checkRateLimit(rateLimitKey('groups-write', auth.tenantId), 20, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  let parsed;
  try {
    parsed = CreateGroupSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    const group = await createGroup(auth.tenantId, parsed.name, auth.uid);
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    console.error('POST /api/groups', err);
    return new NextResponse('create_failed', { status: 500 });
  }
}
