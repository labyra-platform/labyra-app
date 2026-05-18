/**
 * Shared auth helper for R164 API routes.
 *
 * Pattern: verify Bearer token → extract tenantId from custom claims.
 * Centralized to reduce duplication across CRUD endpoints.
 *
 * @phase R164-phase-4a
 */
import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromToken } from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';

export interface AuthSuccess {
  tenantId: string;
  uid: string;
  error?: undefined;
}

export interface AuthFailure {
  error: NextResponse;
  tenantId?: undefined;
  uid?: undefined;
}

export type AuthResult = AuthSuccess | AuthFailure;

export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: new NextResponse('unauthorized', { status: 401 }) };
  }
  try {
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const tenantId = getTenantIdFromToken(decoded);
    if (!tenantId) {
      return { error: new NextResponse('no_tenant', { status: 403 }) };
    }
    return { tenantId, uid: decoded.uid };
  } catch {
    return { error: new NextResponse('invalid_token', { status: 401 }) };
  }
}
