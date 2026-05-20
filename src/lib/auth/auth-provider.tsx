'use client';

/**
 * Firebase Auth Context Provider
 *
 * Subscribes to Firebase Auth state changes và provides:
 * - user: current Firebase User hoặc null
 * - loading: true while initial auth state being determined
 * - claims: custom claims (role, tenantId)
 *
 * Wrap root layout với <AuthProvider> để cung cấp context.
 */

import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
import type React from 'react';
import { createContext, type ReactNode, useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';

export interface AuthClaims {
  role?: 'admin' | 'superadmin' | 'member' | 'viewer';
  tenantId?: string;
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: User | null;
  claims: AuthClaims;
  loading: boolean;
}

// L4: type guard thay vì `as AuthClaims` cast
function parseAuthClaims(claims: unknown): AuthClaims {
  if (typeof claims !== 'object' || claims === null) return {};
  const c = claims as Record<string, unknown>;
  return {
    role: ['admin', 'superadmin', 'member', 'viewer'].includes(c.role as string)
      ? (c.role as AuthClaims['role'])
      : undefined,
    tenantId: typeof c.tenantId === 'string' ? c.tenantId : undefined,
    ...c
  };
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  claims: {},
  loading: true
});

export function AuthProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<AuthClaims>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch fresh ID token result để lấy custom claims
        const tokenResult = await firebaseUser.getIdTokenResult();
        setClaims(parseAuthClaims(tokenResult.claims));
      } else {
        setClaims({});
      }

      setLoading(false);
    });

    // Listen for token refresh (custom claims update)
    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setClaims(parseAuthClaims(tokenResult.claims));

        // Sync token to HttpOnly cookie via server route (C2)
        const token = tokenResult.token;
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        });
      } else {
        // Clear cookie on sign-out
        // Clear HttpOnly cookie via server route (C2)
        await fetch('/api/auth/session', { method: 'DELETE' });
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  return <AuthContext.Provider value={{ user, claims, loading }}>{children}</AuthContext.Provider>;
}
