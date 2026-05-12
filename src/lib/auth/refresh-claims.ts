'use client';

/**
 * Force-refresh Firebase ID token to pull updated custom claims.
 *
 * Firebase caches ID tokens for ~1 hour. When an admin updates a user's
 * role via setCustomUserClaims(), the client won't see the new claims
 * until the next token refresh — normally on sign-in or after ~1 hour.
 *
 * Call refreshAuthClaims() to force an immediate refresh:
 *   - After updating own profile that changed role
 *   - After admin tools updated current user
 *   - As a "Refresh permissions" button in admin UI
 *
 * The onIdTokenChanged listener in AuthProvider will fire and update
 * the React context, so components re-render with new claims.
 */

import { getFirebaseAuth } from '@/lib/firebase/client';

export async function refreshAuthClaims(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return;
  // Force refresh — `true` bypasses the cached token.
  await user.getIdToken(true);
}
