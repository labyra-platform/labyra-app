/**
 * POST /api/auth/session  — set HttpOnly session cookie
 * DELETE /api/auth/session — clear session cookie
 *
 * Cookie: __Host-session (HttpOnly, Secure, SameSite=Lax, path=/)
 * Value: Firebase ID token (verified before storing)
 *
 * @phase C2
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getAdminAuthService } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

const COOKIE_NAME = '__Host-session';
const MAX_AGE = 3600; // 1h — matches Firebase ID token TTL

export async function POST(request: Request): Promise<NextResponse> {
  let token: string;
  try {
    const body = (await request.json()) as { idToken?: unknown };
    if (typeof body.idToken !== 'string' || !body.idToken) {
      return NextResponse.json({ error: 'idToken_required' }, { status: 400 });
    }
    token = body.idToken;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Verify token is legit before storing
  try {
    await getAdminAuthService().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE
  });
  return res;
}

export async function DELETE(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return res;
}
