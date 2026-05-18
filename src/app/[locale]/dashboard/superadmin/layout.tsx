'use client';
import { useRouter } from 'next/navigation';
import * as React from 'react';
/**
 * Superadmin section layout — client-side role guard.
 *
 * Server-side guard happens at API level (superadmin-guard.ts).
 * Client guard here prevents UI flash for non-superadmin users.
 *
 * @phase R172-5
 */
import { useIsSuperAdmin } from '@/lib/auth/use-claims';

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const isSuperadmin = useIsSuperAdmin();
  const router = useRouter();

  React.useEffect(() => {
    if (isSuperadmin === false) {
      router.replace('/dashboard/overview');
    }
  }, [isSuperadmin, router]);

  if (!isSuperadmin) {
    return (
      <div className='flex h-96 items-center justify-center'>
        <p className='text-muted-foreground text-sm'>Checking permissions...</p>
      </div>
    );
  }

  return <>{children}</>;
}
