'use client';

/**
 * Convenience hooks built on top of useAuth() to read individual claims.
 *
 * These keep components small and intent-clear:
 *   const tenantId = useTenantId();
 *   if (!tenantId) return <SignInPrompt />;
 *
 * vs the verbose form:
 *   const { claims } = useAuth();
 *   if (!claims.tenantId) return <SignInPrompt />;
 */

import { useAuth } from './use-auth';

export type AuthRole = 'admin' | 'superadmin' | 'member' | 'viewer';

/** Current user's tenantId from custom claims, or null if not authenticated. */
export function useTenantId(): string | null {
  const { claims } = useAuth();
  return typeof claims.tenantId === 'string' ? claims.tenantId : null;
}

/** Current user's role from custom claims, or null. */
export function useRole(): AuthRole | null {
  const { claims } = useAuth();
  const role = claims.role;
  if (role === 'admin' || role === 'superadmin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}

/** True if user has admin or superadmin role within their tenant. */
export function useIsAdmin(): boolean {
  const role = useRole();
  return role === 'admin' || role === 'superadmin';
}

/** True if user is a platform-level super-admin (can read across tenants). */
export function useIsSuperAdmin(): boolean {
  return useRole() === 'superadmin';
}

/** Current user's groupId from custom claims, or null (ADR-034 TEAM-1). */
export function useGroupId(): string | null {
  const { claims } = useAuth();
  return typeof claims.groupId === 'string' ? claims.groupId : null;
}

/** True if the user is the appointed leader (group_admin) of their group. */
export function useIsGroupLead(): boolean {
  const { claims } = useAuth();
  return claims.isGroupLead === true;
}

/**
 * True if signed in AND has a tenantId claim.
 *
 * A user can be signed in but lack tenantId — e.g. fresh sign-up before
 * an admin assigns them to a tenant. Treat as not-fully-authenticated.
 */
export function useIsAuthenticated(): boolean {
  const { user } = useAuth();
  const tenantId = useTenantId();
  return user !== null && tenantId !== null;
}
