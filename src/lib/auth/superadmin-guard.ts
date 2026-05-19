/**
 * Server-side superadmin guard — verify role from Firebase ID token.
 *
 * Usage in API routes:
 *   const guard = await requireSuperadmin(request);
 *   if (!guard.allowed) return guard.response;
 *   // ... continue with logic
 *
 * @phase R172-1
 */
import 'server-only';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';

export interface SuperadminGuardResult {
  allowed: boolean;
  uid?: string;
  decoded?: DecodedIdToken;
  response?: NextResponse;
}

export async function requireSuperadmin(request: Request): Promise<SuperadminGuardResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      allowed: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    };
  }

  const token = authHeader.slice(7);
  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuthService().verifyIdToken(token);
  } catch (_err) {
    void _err;
    return {
      allowed: false,
      response: NextResponse.json({ error: 'invalid_token' }, { status: 401 })
    };
  }

  const role = (decoded as { role?: unknown }).role;
  if (role !== 'superadmin') {
    return {
      allowed: false,
      response: NextResponse.json({ error: 'forbidden_not_superadmin' }, { status: 403 })
    };
  }

  return { allowed: true, uid: decoded.uid, decoded };
}
