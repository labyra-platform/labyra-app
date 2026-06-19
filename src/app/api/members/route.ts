/**
 * GET /api/members — list members of the current tenant (admin/superadmin).
 * @phase R285 (ADR-034 TEAM-4)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/api/auth-helper';
import { listTenantMembers } from '@/lib/firebase/members/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (auth.error) return auth.error;
  try {
    const items = await listTenantMembers(auth.tenantId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('GET /api/members', err);
    return new NextResponse('list_failed', { status: 500 });
  }
}
