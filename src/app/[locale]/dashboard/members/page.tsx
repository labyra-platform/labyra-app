'use client';

/**
 * Members — manage invites for the current tenant (ADR-031).
 *
 * Admin-only (route gated; UI also hides for non-admin). Lists invites and
 * provides a create-invite form. Member management (role change, removal) is
 * a later phase; this ships the invite half required for onboarding.
 *
 * @phase ONBOARD-2 / TD-ONBOARD-2 (shadcn UI)
 */
import { IconCheck, IconClock, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useIsAdmin, useIsSuperAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';

type InviteRole = 'admin' | 'member' | 'viewer';

interface Invite {
  id: string;
  email: string;
  role: InviteRole;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: number;
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

const STATUS_ICON = {
  pending: IconClock,
  accepted: IconCheck,
  revoked: IconX
} as const;

export default function MembersPage() {
  const isAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/invites');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: Invite[] };
      setInvites(data.items);
    } catch {
      toast.error('Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function handleCreate() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/invites', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), role })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'create_failed');
      }
      toast.success(`Invited ${email}`);
      setEmail('');
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create_failed';
      toast.error(
        msg === 'forbidden_invite_admin'
          ? 'Only a superadmin can invite an admin.'
          : 'Failed to create invite'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await authedFetch(`/api/invites/${id}/revoke`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Invite revoked');
      void load();
    } catch {
      toast.error('Failed to revoke');
    }
  }

  if (!isAdmin) {
    return (
      <PageContainer pageTitle='Members' pageDescription='Manage lab members and invitations'>
        <div className='text-muted-foreground py-12 text-center text-sm'>
          You need administrator access to manage members.
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer pageTitle='Members' pageDescription='Invite and manage lab members'>
      <div className='space-y-8'>
        {/* Create invite */}
        <div className='rounded-lg border border-input p-4'>
          <h2 className='mb-3 text-sm font-medium'>Invite a member</h2>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Input
              type='email'
              aria-label='Invitee email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='email@example.com'
              className='flex-1'
            />
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger className='w-full sm:w-40' aria-label='Invitee role'>
                <SelectValue placeholder='Role' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='viewer'>Viewer</SelectItem>
                <SelectItem value='member'>Member</SelectItem>
                {isSuperAdmin && <SelectItem value='admin'>Admin</SelectItem>}
              </SelectContent>
            </Select>
            <Button onClick={() => void handleCreate()} disabled={submitting || !email.trim()}>
              {submitting ? 'Inviting…' : 'Send invite'}
            </Button>
          </div>
          <p className='text-muted-foreground mt-2 text-xs'>
            The invitee must sign up with this exact email to join. Invites expire in 7 days.
          </p>
        </div>

        {/* Invite list */}
        <div>
          <h2 className='mb-3 text-sm font-medium'>Invitations</h2>
          {loading ? (
            <div className='text-muted-foreground py-8 text-center text-sm'>Loading…</div>
          ) : invites.length === 0 ? (
            <div className='text-muted-foreground py-8 text-center text-sm'>
              No invitations yet.
            </div>
          ) : (
            <ul className='divide-border divide-y rounded-lg border border-input'>
              {invites.map((inv) => {
                const Icon = STATUS_ICON[inv.status];
                return (
                  <li key={inv.id} className='flex items-center justify-between px-4 py-3'>
                    <div className='flex items-center gap-3'>
                      <Icon className='text-muted-foreground size-4' />
                      <div>
                        <div className='text-sm font-medium'>{inv.email}</div>
                        <div className='text-muted-foreground text-xs capitalize'>
                          {inv.role} · {inv.status}
                        </div>
                      </div>
                    </div>
                    {inv.status === 'pending' && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => void handleRevoke(inv.id)}
                        className='text-destructive hover:text-destructive'
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
