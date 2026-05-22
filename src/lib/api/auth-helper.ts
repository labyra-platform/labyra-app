/**
 * Shared auth helper for R164 API routes.
 *
 * Pattern: verify Bearer token → extract tenantId + role from custom claims.
 * Centralized to reduce duplication across CRUD endpoints.
 *
 * @phase R164-phase-4a
 * @phase RBAC-1 ADR-030: added role + authenticateWriter
 */
import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import {
  getTenantIdFromToken,
  getRoleFromToken,
  getGroupIdFromToken,
  isGroupLeadFromToken
} from '@/lib/auth/token';
import { getAdminAuthService } from '@/lib/firebase/admin';

export interface AuthSuccess {
  tenantId: string;
  uid: string;
  role: 'superadmin' | 'admin' | 'member' | 'viewer' | null;
  /** ADR-034 TEAM-1/2: group scope claims (single group per user). */
  groupId: string | null;
  isGroupLead: boolean;
  error?: undefined;
}
export interface AuthFailure {
  error: NextResponse;
  tenantId?: undefined;
  uid?: undefined;
  role?: undefined;
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
    const role = getRoleFromToken(decoded);
    const groupId = getGroupIdFromToken(decoded);
    const isGroupLead = isGroupLeadFromToken(decoded);
    return { tenantId, uid: decoded.uid, role, groupId, isGroupLead };
  } catch {
    return { error: new NextResponse('invalid_token', { status: 401 }) };
  }
}

/**
 * authenticateWriter — requires member, admin, or superadmin role.
 * Viewers get 403. Use for all POST/PATCH/DELETE mutation routes.
 *
 * ADR-030: member = full CRUD within tenant, viewer = read-only.
 */
export async function authenticateWriter(req: NextRequest): Promise<AuthResult> {
  const auth = await authenticate(req);
  if (auth.error) return auth;
  if (auth.role === 'viewer') {
    return { error: new NextResponse('forbidden_viewer', { status: 403 }) };
  }
  // null role (claim missing) = deny — safer than allow
  if (auth.role === null) {
    return { error: new NextResponse('forbidden_no_role', { status: 403 }) };
  }
  return auth;
}

/**
 * authenticateAdmin — requires admin or superadmin role.
 * Use for tenant settings, member management, billing routes.
 */
export async function authenticateAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await authenticate(req);
  if (auth.error) return auth;
  if (auth.role !== 'admin' && auth.role !== 'superadmin') {
    return { error: new NextResponse('forbidden_not_admin', { status: 403 }) };
  }
  return auth;
}
