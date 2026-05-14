/**
 * API: PATCH/DELETE /api/experiments/[id] — update / delete Experiment
 * @phase R160-data-1
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { getTenantIdFromToken } from '@/lib/auth/token';

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
  if (!tenantId) {
    return new NextResponse('no_tenant', { status: 403 });
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
    const ref = db.doc(`tenants/${auth.tenantId}/experiments/${id}`);
    await ref.update({ ...data, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /experiments/[id] error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const db = getAdminFirestoreService();
    const ref = db.doc(`tenants/${auth.tenantId}/experiments/${id}`);
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /experiments/[id] error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', { status: 500 });
  }
}
