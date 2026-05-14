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
