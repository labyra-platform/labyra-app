/**
 * API: PATCH/DELETE /api/equipment/[id] — update / delete Equipment
 * @phase R160-data-2
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

async function authorize(
  req: NextRequest
): Promise<{ uid: string; tenantId: string } | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  const decoded = await getAdminAuthService().verifyIdToken(token);
  const tenantId = getTenantIdFromToken(decoded);
  const role = getRoleFromToken(decoded);
  if (role === 'viewer' || role === null) {
    return new NextResponse('forbidden_viewer', { status: 403 });
  }
  if (!tenantId) {
    return new NextResponse('no_tenant', { status: 403 });
  }

  // R162-tier-rate-limit — per-tenant rate limit
  const rl = await checkRateLimit(rateLimitKey('equipment-edit', tenantId), 30, 60);
  if (!rl.allowed) {
    return new NextResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(rl.resetSec) }
    });
  }
  return { uid: decoded.uid, tenantId };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await req.json();
    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${auth.tenantId}/equipment/${id}`);
    await ref.update({ ...data, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /equipment/[id] error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${auth.tenantId}/equipment/${id}`);
    await ref.delete();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /equipment/[id] error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
