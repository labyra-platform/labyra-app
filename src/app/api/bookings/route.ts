/**
 * API: POST /api/bookings — create new Booking
 * @phase R160-data-2
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken, getRoleFromToken } from '@/lib/auth/token';
import { getAdminAuthService, getAdminFirestoreService } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitKey } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
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
    const rl = await checkRateLimit(rateLimitKey('bookings-write', tenantId), 30, 60);
    if (!rl.allowed) {
      return new NextResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(rl.resetSec) }
      });
    }
    const data = await req.json();
    const db = getAdminFirestoreService();
    const colRef = db.collection(`tenants/${tenantId}/bookings`);
    const docRef = colRef.doc();
    const now = Date.now();
    await docRef.set({
      ...data,
      id: docRef.id,
      tenantId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: decoded.uid,
      userId: data.userId ?? decoded.uid
    });
    return NextResponse.json({ id: docRef.id });
  } catch (err) {
    console.error('POST /bookings error', err);
    return new NextResponse(err instanceof Error ? err.message : 'error', {
      status: 500
    });
  }
}
