'use client';

/**
 * useAuth hook — consume AuthContext
 *
 * Usage:
 *   const { user, claims, loading } = useAuth();
 *
 *   if (loading) return <Skeleton />;
 *   if (!user) return <SignInPrompt />;
 *   if (claims.role !== 'admin') return <Forbidden />;
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './auth-provider';

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
