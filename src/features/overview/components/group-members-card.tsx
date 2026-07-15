'use client';

/**
 * R506: group members.
 *
 * A lab runs several groups, so a lab head needs to look across all of them —
 * the picker appears only for admins, and only when there is more than one
 * group to choose between. Everyone else sees their own group with no control
 * at all, because there is nothing for them to choose. The server decides who
 * may switch (`canSwitchGroup`); this component only renders that verdict.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { type GroupMember, useGroupRoster } from '../use-group-roster';

function initials(m: GroupMember): string {
  const src = (m.displayName || m.email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts.at(-1)![0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function GroupMembersCard() {
  const t = useTranslations('dashboard');
  const tRoles = useTranslations('common.roles');
  const [groupId, setGroupId] = useState<string | null>(null);
  const { group, members, groups, canSwitchGroup, isLoading: loading } = useGroupRoster(groupId);
  const showPicker = canSwitchGroup && groups.length > 1;
  const currentId = groupId ?? group?.id ?? '';

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='flex min-w-0 items-center gap-2 text-base'>
            <Icons.teams className='size-4 shrink-0' aria-hidden />
            <span className='truncate'>{t('members.title')}</span>
          </CardTitle>
          {showPicker ? (
            <Select value={currentId} onValueChange={(v) => setGroupId(v)}>
              <SelectTrigger size='sm' className='h-7 w-36 text-xs'>
                <SelectValue placeholder={t('members.allGroups')} />
              </SelectTrigger>
              <SelectContent align='end' className='min-w-36'>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id} className='text-xs'>
                    {g.name || g.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            group?.name && (
              <span className='text-muted-foreground truncate text-xs'>{group.name}</span>
            )
          )}
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col'>
        {loading ? (
          <div className='space-y-3'>
            {[0, 1, 2].map((i) => (
              <div key={i} className='flex items-center gap-2.5'>
                <Skeleton className='size-8 rounded-full' />
                <Skeleton className='h-4 flex-1' />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>{t('members.empty')}</p>
        ) : (
          <ul className='flex-1 space-y-2.5'>
            {members.slice(0, 6).map((m) => (
              <li key={m.uid} className='flex items-center gap-2.5'>
                <Avatar className='size-8'>
                  <AvatarFallback className='text-[10px]'>{initials(m)}</AvatarFallback>
                </Avatar>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{m.displayName || m.email}</p>
                  {m.isGroupLead && (
                    <p className='text-muted-foreground text-xs'>{t('members.lead')}</p>
                  )}
                </div>
                <Badge variant='secondary' className='shrink-0 text-[10px] font-normal'>
                  {tRoles(m.role)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className='mt-3'>
          <Button asChild size='sm' variant='outline' className='w-full'>
            <Link href='/dashboard/members'>
              <Icons.add className='size-4' aria-hidden />
              {t('members.invite')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
