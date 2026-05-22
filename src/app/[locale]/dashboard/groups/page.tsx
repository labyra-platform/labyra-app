'use client';

/**
 * Research Groups — owner manages groups + appoints leaders (ADR-034 TEAM-1b).
 *
 * Admin-only (route gated; UI also hides for non-admin). Lists groups and
 * provides create / rename / appoint-leader / delete. Leader appointment takes
 * a uid directly for now (members-list dropdown is a later phase). Per-group
 * DATA isolation is TEAM-4 — this is the management surface only.
 *
 * @phase TEAM-1b (ADR-034)
 */
import { IconUsers, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsAdmin } from '@/lib/auth/use-claims';
import { getFirebaseAuth } from '@/lib/firebase/client';

interface Group {
  id: string;
  name: string;
  leaderId?: string;
  createdAt: number;
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

export default function GroupsPage() {
  const t = useTranslations('groups');
  const isAdmin = useIsAdmin();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [leaderEdit, setLeaderEdit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/groups');
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: Group[] };
      setGroups(data.items);
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('created', { name: name.trim() }));
      setName('');
      void load();
    } catch {
      toast.error(t('createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAppointLeader(id: string) {
    const uid = (leaderEdit[id] ?? '').trim();
    if (!uid) return;
    try {
      const res = await authedFetch(`/api/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ leaderId: uid })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'update_failed');
      }
      toast.success(t('leaderSet'));
      setLeaderEdit((s) => ({ ...s, [id]: '' }));
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'update_failed';
      toast.error(msg === 'leader_not_in_tenant' ? t('leaderNotInTenant') : t('updateFailed'));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    try {
      const res = await authedFetch(`/api/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('deleted'));
      void load();
    } catch {
      toast.error(t('deleteFailed'));
    }
  }

  if (!isAdmin) {
    return (
      <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
        <div className='text-muted-foreground py-12 text-center text-sm'>{t('adminOnly')}</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer pageTitle={t('title')} pageDescription={t('subtitle')}>
      <div className='space-y-8'>
        {/* Create group */}
        <div className='border-input rounded-lg border p-4'>
          <h2 className='mb-3 text-sm font-medium'>{t('createHeading')}</h2>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Input
              aria-label={t('nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className='flex-1'
            />
            <Button onClick={() => void handleCreate()} disabled={submitting || !name.trim()}>
              {submitting ? t('creating') : t('createButton')}
            </Button>
          </div>
        </div>

        {/* Group list */}
        <div>
          <h2 className='mb-3 text-sm font-medium'>{t('listHeading')}</h2>
          {loading ? (
            <div className='text-muted-foreground py-8 text-center text-sm'>{t('loading')}</div>
          ) : groups.length === 0 ? (
            <div className='text-muted-foreground py-8 text-center text-sm'>{t('empty')}</div>
          ) : (
            <ul className='divide-border border-input divide-y rounded-lg border'>
              {groups.map((g) => (
                <li
                  key={g.id}
                  className='flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                >
                  <div className='flex items-center gap-3'>
                    <IconUsers className='text-muted-foreground size-4' />
                    <div>
                      <div className='text-sm font-medium'>{g.name}</div>
                      <div className='text-muted-foreground text-xs'>
                        {g.leaderId ? t('leaderUid', { uid: g.leaderId }) : t('noLeader')}
                      </div>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Input
                      aria-label={t('leaderInputLabel')}
                      value={leaderEdit[g.id] ?? ''}
                      onChange={(e) => setLeaderEdit((s) => ({ ...s, [g.id]: e.target.value }))}
                      placeholder={t('leaderPlaceholder')}
                      className='h-8 w-44 text-xs'
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => void handleAppointLeader(g.id)}
                      disabled={!(leaderEdit[g.id] ?? '').trim()}
                    >
                      {t('appointLeader')}
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='text-destructive hover:text-destructive size-8'
                      aria-label={t('delete')}
                      onClick={() => void handleDelete(g.id)}
                    >
                      <IconTrash className='size-4' />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
