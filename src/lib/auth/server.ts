import 'server-only';

/**
 * Server-side auth helpers
 *
 * For Server Components, Route Handlers, Server Actions.
 * Verifies Firebase ID token từ session cookie.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyIdToken } from '@/lib/firebase/admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

/**
 * Get current authenticated user từ session cookie.
 * Returns null nếu không authenticated.
 */
export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('__session')?.value;

  if (!token) return null;

  try {
    const decoded = await verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Require authentication — redirect to /sign-in nếu chưa auth.
 * Use trong Server Components cần guard.
 */
export async function requireAuth(): Promise<DecodedIdToken> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/**
 * Require specific role — redirect to /forbidden nếu thiếu quyền.
 */
export async function requireRole(
  allowedRoles: Array<'admin' | 'superadmin' | 'member' | 'viewer'>
): Promise<DecodedIdToken> {
  const user = await requireAuth();
  const role = user.role as string | undefined;

  if (!role || !allowedRoles.includes(role as 'admin' | 'superadmin' | 'member' | 'viewer')) {
    redirect('/forbidden');
  }

  return user;
}
