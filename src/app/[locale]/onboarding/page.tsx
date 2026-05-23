'use client';

/**
 * /onboarding — accept a pending invite to join a tenant.
 *
 * For orphan users (signed in, no tenantId claim). Fetches pending invites
 * matching the verified email, lets the user accept one, then refreshes the
 * ID token to pull the new {tenantId, role} claims and enters the dashboard.
 *
 * @phase ONBOARD-2
 */
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendVerificationEmail, signOut } from '@/lib/auth/actions';
import { refreshAuthClaims } from '@/lib/auth/refresh-claims';
import { useAuth } from '@/lib/auth/use-auth';
import { useTenantId } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';

interface PendingInvite {
  id: string;
  tenantId: string;
  role: 'admin' | 'member' | 'viewer';
  expiresAt: number;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  });
}

async function handleReloadUser() {
  // Pull fresh emailVerified after the user clicks the link in their inbox.
  const u = getFirebaseAuth().currentUser;
  if (u) {
    await u.reload();
    // Force token refresh so AuthProvider re-reads; then reload page state.
    await u.getIdToken(true);
    window.location.reload();
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const tenantId = useTenantId();
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Firebase user.emailVerified — Google = true; email/password = false until verified.
  const emailVerified = user?.emailVerified ?? false;

  // Already has a tenant → go to dashboard.
  useEffect(() => {
    if (!loading && tenantId) router.replace('/dashboard');
  }, [loading, tenantId, router]);

  // Not signed in → sign-in.
  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, user, router]);

  const loadInvites = useCallback(async () => {
    try {
      const res = await authedFetch('/api/onboarding/pending');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: PendingInvite[] };
      setInvites(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && !tenantId && emailVerified) void loadInvites();
  }, [loading, user, tenantId, emailVerified, loadInvites]);

  async function handleAccept(invite: PendingInvite) {
    setAccepting(invite.id);
    setError(null);
    try {
      const res = await authedFetch('/api/onboarding/accept', {
        method: 'POST',
        body: JSON.stringify({ tenantId: invite.tenantId, inviteId: invite.id })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'accept_failed');
      }
      // Pull new claims into the client token, then enter dashboard.
      await refreshAuthClaims();
      toast.success('Joined successfully');
      // Small delay so onIdTokenChanged propagates claims to context.
      setTimeout(() => router.replace('/dashboard'), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'accept_failed');
      setAccepting(null);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.success('Verification email sent. Check your inbox.');
    } catch {
      toast.error('Failed to send verification email.');
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/sign-in');
  }

  if (loading || tenantId) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='text-muted-foreground text-sm'>Loading…</div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-4'>
      <div className='w-full max-w-md space-y-6'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>Join a lab</h1>
          <p className='text-muted-foreground text-sm'>
            {user?.email ? `Pending invitations for ${user.email}` : 'Pending invitations'}
          </p>
        </div>

        {error && (
          <div className='rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
            {error === 'email_mismatch'
              ? 'This invite was sent to a different email.'
              : error === 'invite_expired'
                ? 'This invitation has expired.'
                : error}
          </div>
        )}

        {!emailVerified ? (
          <div className='space-y-4 rounded-lg border border-input p-6 text-center'>
            <p className='text-sm'>
              Please verify your email address before joining a lab. We sent a link to{' '}
              <span className='font-medium'>{user?.email}</span>.
            </p>
            <div className='flex flex-col gap-2 sm:flex-row sm:justify-center'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void handleResendVerification()}
                disabled={resending}
              >
                {resending ? 'Sending…' : 'Resend email'}
              </Button>
              <Button size='sm' onClick={() => void handleReloadUser()}>
                I've verified
              </Button>
            </div>
          </div>
        ) : invites === null ? (
          <div className='text-muted-foreground text-center text-sm'>Checking invitations…</div>
        ) : invites.length === 0 ? (
          <div className='rounded-lg border border-input p-6 text-center'>
            <p className='text-sm text-muted-foreground'>
              No pending invitations found for your account. Ask your lab administrator to invite{' '}
              <span className='font-medium'>{user?.email}</span>.
            </p>
          </div>
        ) : (
          <ul className='space-y-3'>
            {invites.map((inv) => (
              <li
                key={inv.id}
                className='flex items-center justify-between rounded-lg border border-input px-4 py-3'
              >
                <div>
                  <div className='text-sm font-medium'>{inv.tenantId}</div>
                  <div className='text-muted-foreground text-xs capitalize'>Role: {inv.role}</div>
                </div>
                <Button
                  size='sm'
                  onClick={() => void handleAccept(inv)}
                  disabled={accepting !== null}
                >
                  {accepting === inv.id ? 'Joining…' : 'Accept'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className='text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void handleSignOut()}
            className='text-muted-foreground text-xs'
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
