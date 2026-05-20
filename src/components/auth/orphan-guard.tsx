'use client';

/**
 * OrphanGuard — redirect signed-in users without a tenantId claim to /onboarding.
 *
 * A fresh sign-up has a Firebase user but no {tenantId, role} custom claims
 * until they accept an invite. Such "orphan" users would hit 403 on every API
 * call inside the dashboard, so we bounce them to the onboarding flow.
 *
 * Placed inside dashboard layout. Renders children only when fully authenticated
 * (user + tenantId) or while loading (to avoid flash).
 *
 * @phase ONBOARD-2
 */
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useTenantId } from '@/lib/auth/use-claims';

export function OrphanGuard({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const { user, loading } = useAuth();
  const tenantId = useTenantId();

  useEffect(() => {
    if (loading) return;
    // Not signed in → proxy.ts already handles redirect to sign-in.
    if (!user) return;
    // Signed in but no tenant claim → orphan → onboarding.
    if (!tenantId) {
      router.replace('/onboarding');
    }
  }, [loading, user, tenantId, router]);

  // While loading or redirecting an orphan, render nothing to avoid 403 flashes.
  if (loading) return children;
  if (user && !tenantId) return null;
  return children;
}
