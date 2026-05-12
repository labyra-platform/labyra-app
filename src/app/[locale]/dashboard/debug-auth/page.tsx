'use client';

/**
 * Auth claims debug page — DEV TOOL ONLY.
 *
 * Renders current Firebase Auth state + custom claims, useful for verifying
 * that:
 *  - User is signed in
 *  - Custom claims (tenantId, role) are present in the ID token
 *  - Force-refresh actually pulls new claims
 *
 * Not linked in the sidebar (underscore-prefixed folder = internal).
 * Access via direct URL: /dashboard/_debug-auth
 */

import { useAuth, useTenantId, useRole, useIsAdmin, refreshAuthClaims } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/layout/page-container';
import { useState } from 'react';

export default function DebugAuthPage() {
  const { user, claims, loading } = useAuth();
  const tenantId = useTenantId();
  const role = useRole();
  const isAdmin = useIsAdmin();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshAuthClaims();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <PageContainer pageTitle='Auth Debug'>
        <p>Loading auth state…</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer pageTitle='Auth Debug' pageDescription='Internal — verify ID token claims'>
      <div className='space-y-6'>
        <section>
          <h2 className='mb-2 text-lg font-semibold'>User</h2>
          {user ? (
            <dl className='grid grid-cols-[120px_1fr] gap-y-1 text-sm'>
              <dt className='text-muted-foreground'>UID</dt>
              <dd className='font-mono'>{user.uid}</dd>
              <dt className='text-muted-foreground'>Email</dt>
              <dd>{user.email ?? '—'}</dd>
              <dt className='text-muted-foreground'>Display name</dt>
              <dd>{user.displayName ?? '—'}</dd>
              <dt className='text-muted-foreground'>Email verified</dt>
              <dd>{user.emailVerified ? 'yes' : 'no'}</dd>
            </dl>
          ) : (
            <p className='text-muted-foreground'>Not signed in.</p>
          )}
        </section>

        <section>
          <h2 className='mb-2 text-lg font-semibold'>Resolved claims (via hooks)</h2>
          <dl className='grid grid-cols-[120px_1fr] gap-y-1 text-sm'>
            <dt className='text-muted-foreground'>tenantId</dt>
            <dd className='font-mono'>
              {tenantId ?? <span className='text-destructive'>null</span>}
            </dd>
            <dt className='text-muted-foreground'>role</dt>
            <dd className='font-mono'>{role ?? <span className='text-destructive'>null</span>}</dd>
            <dt className='text-muted-foreground'>isAdmin</dt>
            <dd>{isAdmin ? 'true' : 'false'}</dd>
          </dl>
        </section>

        <section>
          <h2 className='mb-2 text-lg font-semibold'>Raw claims payload</h2>
          <pre className='bg-muted overflow-x-auto rounded p-3 text-xs'>
            {JSON.stringify(claims, null, 2)}
          </pre>
        </section>

        <section>
          <Button onClick={handleRefresh} disabled={refreshing || !user}>
            {refreshing ? 'Refreshing…' : 'Force refresh ID token'}
          </Button>
          <p className='text-muted-foreground mt-2 text-xs'>
            Use after an admin updates your role to pull new claims without signing out.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
