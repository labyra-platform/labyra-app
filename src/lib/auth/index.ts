/**
 * Auth module barrel exports
 *
 * Client-side: AuthProvider, useAuth, actions
 * Server-side: import explicit từ './server' để Next.js bundler split đúng
 */

export {
  resetPassword,
  establishSession,
  signInWithEmail,
  signInWithGithub,
  signInWithGoogle,
  signOut,
  signUpWithEmail
} from './actions';
export type { AuthClaims, AuthContextValue } from './auth-provider';
export { AuthContext, AuthProvider } from './auth-provider';
export { refreshAuthClaims } from './refresh-claims';
export { useAuth } from './use-auth';
export type { AuthRole } from './use-claims';
export {
  useIsAdmin,
  useIsAuthenticated,
  useIsSuperAdmin,
  useRole,
  useTenantId
} from './use-claims';

// Server-only: import explicit
// import { getCurrentUser, requireAuth, requireRole } from '@/lib/auth/server';
