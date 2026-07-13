'use client';

/**
 * Group tab — the members of the research group the signed-in account belongs
 * to. Read-only roster (name, email, role, lead) via GET /api/groups/my/members;
 * membership management stays with admins in Members.
 *
 * @phase R485 — unified settings
 */
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth/use-auth';

interface GroupMember {
  uid: string;
  displayName: string;
  email: string;
  role: string;
  isGroupLead: boolean;
}

interface MyGroupResponse {
  group: { id: string; name: string } | null;
  items: GroupMember[];
}

function initialsOf(name: string, email: string): string {
  const base = name.trim() || email.split('@')[0] || '';
  return (
    base
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'
  );
}

export function GroupMembers() {
  const t = useTranslations('settings.group');
  const { user } = useAuth();
  const [data, setData] = useState<MyGroupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) throw new Error('no_token');
      const res = await fetch('/api/groups/my/members', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as MyGroupResponse);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className='max-w-2xl'>
        <CardHeader>
          <Skeleton className='h-5 w-40' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent className='space-y-3'>
          {[0, 1, 2].map((i) => (
            <div key={i} className='flex items-center gap-3'>
              <Skeleton className='size-9 rounded-full' />
              <div className='space-y-1.5'>
                <Skeleton className='h-4 w-36' />
                <Skeleton className='h-3 w-48' />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='max-w-2xl'>
        <CardContent className='text-muted-foreground flex items-center gap-2 py-8 text-sm'>
          <Icons.warning className='size-4 shrink-0' aria-hidden='true' />
          {t('loadError')}
        </CardContent>
      </Card>
    );
  }

  if (!data?.group) {
    return (
      <Card className='max-w-2xl'>
        <CardContent className='flex flex-col items-center justify-center gap-2 py-12 text-center'>
          <Icons.teams className='text-muted-foreground/40 size-10' aria-hidden='true' />
          <p className='text-sm font-medium'>{t('noGroup')}</p>
          <p className='text-muted-foreground text-sm'>{t('noGroupDesc')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='max-w-2xl'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icons.teams className='size-4' aria-hidden='true' />
          {data.group.name || t('unnamedGroup')}
        </CardTitle>
        <CardDescription>{t('membersCount', { count: data.items.length })}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.items.length === 0 ? (
          <p className='text-muted-foreground py-4 text-sm'>{t('empty')}</p>
        ) : (
          <ul className='divide-border divide-y'>
            {data.items.map((m) => (
              <li key={m.uid} className='flex items-center gap-3 py-3 first:pt-0 last:pb-0'>
                <Avatar className='size-9'>
                  <AvatarFallback className='text-xs'>
                    {initialsOf(m.displayName, m.email)}
                  </AvatarFallback>
                </Avatar>
                <div className='min-w-0 flex-1 text-sm'>
                  <div className='flex items-center gap-2'>
                    <span className='truncate font-medium'>
                      {m.displayName || m.email.split('@')[0]}
                    </span>
                    {m.uid === user?.uid && (
                      <Badge variant='outline' className='shrink-0'>
                        {t('you')}
                      </Badge>
                    )}
                    {m.isGroupLead && (
                      <Badge variant='secondary' className='shrink-0'>
                        {t('lead')}
                      </Badge>
                    )}
                  </div>
                  <div className='text-muted-foreground truncate'>{m.email}</div>
                </div>
                <span className='text-muted-foreground shrink-0 text-xs capitalize'>{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
