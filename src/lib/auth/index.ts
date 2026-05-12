/**
 * Auth module barrel exports
 *
 * Client-side: AuthProvider, useAuth, actions
 * Server-side: import explicit từ './server' để Next.js bundler split đúng
 */

export { AuthProvider, AuthContext } from './auth-provider';
export type { AuthClaims, AuthContextValue } from './auth-provider';
export { useAuth } from './use-auth';
export {
  useTenantId,
  useRole,
  useIsAdmin,
  useIsSuperAdmin,
  useIsAuthenticated
} from './use-claims';
export type { AuthRole } from './use-claims';
export { refreshAuthClaims } from './refresh-claims';
export {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  signOut,
  resetPassword
} from './actions';

// Server-only: import explicit
// import { getCurrentUser, requireAuth, requireRole } from '@/lib/auth/server';
