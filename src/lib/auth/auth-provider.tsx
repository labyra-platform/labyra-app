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

import type React from 'react';
import { createContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, onIdTokenChanged, type User } from 'firebase/auth';
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
        setClaims(tokenResult.claims as AuthClaims);
      } else {
        setClaims({});
      }

      setLoading(false);
    });

    // Listen for token refresh (custom claims update)
    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setClaims(tokenResult.claims as AuthClaims);

        // Sync token to cookie for server-side middleware
        const token = tokenResult.token;
        document.cookie = `__session=${token}; path=/; max-age=3600; SameSite=Lax`;
      } else {
        // Clear cookie on sign-out
        document.cookie = '__session=; path=/; max-age=0; SameSite=Lax';
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  return <AuthContext.Provider value={{ user, claims, loading }}>{children}</AuthContext.Provider>;
}
