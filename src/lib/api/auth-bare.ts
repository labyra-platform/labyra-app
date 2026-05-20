/**
 * Bare auth — verify Bearer token only, NO tenant/role requirement.
 *
 * For onboarding routes where the user is an orphan (no tenantId/role yet)
 * and is in the process of accepting an invite to GET those claims.
 *
 * @phase ONBOARD-1
 */
import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';

export interface BareAuthSuccess {
  uid: string;
  email: string;
  error?: undefined;
}
export interface BareAuthFailure {
  error: NextResponse;
  uid?: undefined;
  email?: undefined;
}
export type BareAuthResult = BareAuthSuccess | BareAuthFailure;

export async function authenticateBare(req: NextRequest): Promise<BareAuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: new NextResponse('unauthorized', { status: 401 }) };
  }
  try {
    const decoded = await getAdminAuthService().verifyIdToken(authHeader.slice('Bearer '.length));
    const email = decoded.email;
    if (!email) {
      return { error: new NextResponse('no_email', { status: 403 }) };
    }
    // Require verified email for invite acceptance (anti-spoofing).
    if (decoded.email_verified === false) {
      return { error: new NextResponse('email_not_verified', { status: 403 }) };
    }
    return { uid: decoded.uid, email };
  } catch {
    return { error: new NextResponse('invalid_token', { status: 401 }) };
  }
}
