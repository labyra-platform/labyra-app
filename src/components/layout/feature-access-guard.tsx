'use client';

/**
 * FeatureAccessGuard (R487, hardened R508).
 *
 * Navigation-level gating. The server is the boundary — every route behind a
 * gated feature now refuses on its own (see lib/api/feature-access) — so this
 * exists to keep a blocked page from appearing at all, not to protect data.
 *
 * R508: it used to render `children` while the verdict was still in flight, so
 * a blocked member saw the whole page — data and all — and was only redirected
 * once the fetch landed. The fix is to withhold the page until the answer is
 * known. Admins are never gated, so they render immediately and pay nothing
 * for this; only a non-admin waits, and only on the one fetch that is then
 * cached for the rest of the session.
 */
import { useEffect } from 'react';
import type React from 'react';
import { featureKeyForPath } from '@/config/nav-config';
import { useFeatureAccess } from '@/hooks/use-feature-access';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useRole } from '@/lib/auth/use-claims';

export function FeatureAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();
  const { disabled, loaded } = useFeatureAccess();

  const isAdmin = role === 'admin' || role === 'superadmin';
  const key = featureKeyForPath(pathname);
  // A route with no feature key can never be gated — don't make it wait.
  const needsVerdict = !isAdmin && key !== null;
  const ready = !needsVerdict || loaded;
  const blocked = ready && needsVerdict && key !== null && disabled.has(key);

  useEffect(() => {
    if (blocked) router.replace('/dashboard/overview');
  }, [blocked, router]);

  if (!ready || blocked) return null;
  return <>{children}</>;
}
