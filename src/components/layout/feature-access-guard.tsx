'use client';

/**
 * FeatureAccessGuard (R487) — redirects non-admin users away from routes whose
 * feature the tenant admin disabled. Navigation-level gating (the sidebar/kbar
 * already hide the entries); data APIs keep their own RBAC/tenant/group
 * enforcement independently.
 */
import { useEffect } from 'react';
import type React from 'react';
import { featureKeyForPath } from '@/config/nav-config';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { useRole } from '@/lib/auth/use-claims';

export function FeatureAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();
  const { disabled, loaded } = useFeatureAccess();

  const isAdmin = role === 'admin' || role === 'superadmin';
  const key = featureKeyForPath(pathname);
  const blocked = loaded && !isAdmin && key !== null && disabled.has(key);

  useEffect(() => {
    if (blocked) router.replace('/dashboard/overview');
  }, [blocked, router]);

  if (blocked) return null;
  return <>{children}</>;
}
