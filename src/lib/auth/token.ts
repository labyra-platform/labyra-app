import 'server-only';

/**
 * Type-safe extraction of tenantId from Firebase DecodedIdToken.
 *
 * tenantId is a custom claim set by our Cloud Functions, so it's not in
 * the stock DecodedIdToken type. This helper centralizes the narrow cast +
 * runtime type check so route files don't repeat the pattern (and don't
 * fall into `as string | undefined` traps).
 *
 * Usage:
 *   const tenantId = getTenantIdFromToken(decoded);
 *   if (!tenantId) return new NextResponse('no_tenant', { status: 403 });
 *
 * @phase R162-tenantid-helper
 */
import type { DecodedIdToken } from 'firebase-admin/auth';

export function getTenantIdFromToken(decoded: DecodedIdToken): string | null {
  const claim = (decoded as { tenantId?: unknown }).tenantId;
  return typeof claim === 'string' ? claim : null;
}

/**
 * Type-safe extraction of role from Firebase DecodedIdToken.
 * role is a custom claim set by our Cloud Functions.
 *
 * @phase RBAC-1 ADR-030
 */
export function getRoleFromToken(
  decoded: DecodedIdToken
): 'superadmin' | 'admin' | 'member' | 'viewer' | null {
  const claim = (decoded as { role?: unknown }).role;
  if (claim === 'superadmin' || claim === 'admin' || claim === 'member' || claim === 'viewer') {
    return claim;
  }
  return null;
}

/**
 * Group claims — ADR-034 TEAM-1. Separate from `role` (2-axis RBAC).
 * groupId scopes the user to a research group; isGroupLead marks the leader.
 * @phase TEAM-1
 */
export function getGroupIdFromToken(decoded: DecodedIdToken): string | null {
  const claim = (decoded as { groupId?: unknown }).groupId;
  return typeof claim === 'string' ? claim : null;
}

export function isGroupLeadFromToken(decoded: DecodedIdToken): boolean {
  return (decoded as { isGroupLead?: unknown }).isGroupLead === true;
}
