'use client';

/**
 * Feature-access settings — client-side admin guard (ADR-035 M1).
 *
 * Mirrors the superadmin layout pattern (R172-5): client guard prevents UI
 * flash for non-admins; the authoritative guard is server-side in
 * PUT /api/tenant/feature-access (authenticateAdmin).
 *
 * @phase R487
 */
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useRole } from '@/lib/auth/use-claims';

export default function FeatureAccessLayout({ children }: { children: React.ReactNode }) {
  const role = useRole();
  const router = useRouter();
  const isAdmin = role === 'admin' || role === 'superadmin';

  React.useEffect(() => {
    if (role !== undefined && role !== null && !isAdmin) {
      router.replace('/dashboard/overview');
    }
  }, [role, isAdmin, router]);

  if (!isAdmin) {
    return (
      <div className='flex h-96 items-center justify-center'>
        <p className='text-muted-foreground text-sm'>Checking permissions...</p>
      </div>
    );
  }

  return <>{children}</>;
}
