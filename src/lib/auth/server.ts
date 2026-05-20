import 'server-only';

/**
 * Server-side auth helpers
 *
 * For Server Components, Route Handlers, Server Actions.
 * Verifies Firebase ID token từ session cookie.
 */

import type { DecodedIdToken } from 'firebase-admin/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyIdToken } from '@/lib/firebase/admin';

/**
 * Get current authenticated user từ session cookie.
 * Returns null nếu không authenticated.
 */
export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('__Host-session')?.value;

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

/**
 * Server-side counterpart to useTenantId(). Returns the tenantId from
 * Firebase custom claims, or null if unauthenticated / claim missing.
 *
 * Type-safe: uses `typeof === 'string'` narrowing instead of `as` casts.
 * Same shape contract as the client hook in src/lib/auth/use-claims.ts.
 *
 * @phase R162-4e-typesafe
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const claim = (user as { tenantId?: unknown }).tenantId;
  return typeof claim === 'string' ? claim : null;
}
