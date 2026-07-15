'use client';

/**
 * Group members (R506, rebuilt on Panel R510).
 *
 * A lab runs several groups, so a lab head needs to look across all of them.
 * The picker appears only for admins, and only when there's more than one
 * group to choose between — everyone else sees their own group with no control
 * at all, because there's nothing for them to choose. The server decides who
 * may switch (`canSwitchGroup`); this only renders that verdict.
 */
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Icons } from '@/components/icons';
import { Panel, PanelEmpty, PanelFooter, PanelList, PanelRow } from '@/components/ui-extra/panel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  const { group, members, groups, canSwitchGroup, isLoading } = useGroupRoster(groupId);

  const showPicker = canSwitchGroup && groups.length > 1;
  const currentId = groupId ?? group?.id ?? '';

  return (
    <Panel
      title={t('members.title')}
      action={
        showPicker ? (
          <Select value={currentId} onValueChange={(v) => setGroupId(v)}>
            <SelectTrigger size='sm' className='text-caption h-7 w-36 rounded-lg'>
              <SelectValue placeholder={t('members.allGroups')} />
            </SelectTrigger>
            <SelectContent align='end' className='min-w-36'>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id} className='text-caption'>
                  {g.name || g.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          group?.name && (
            <span className='text-muted-foreground text-caption shrink-0 truncate'>
              {group.name}
            </span>
          )
        )
      }
    >
      {isLoading ? (
        <div className='space-y-2'>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className='h-9 w-full' />
          ))}
        </div>
      ) : members.length === 0 ? (
        <PanelEmpty title={t('members.emptyTitle')} description={t('members.empty')} />
      ) : (
        <PanelList>
          {members.slice(0, 6).map((m) => (
            <PanelRow key={m.uid}>
              <Avatar className='size-8'>
                <AvatarFallback className='text-meta'>{initials(m)}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <p className='text-body truncate'>{m.displayName || m.email}</p>
                {m.isGroupLead && (
                  <p className='text-muted-foreground text-meta'>{t('members.lead')}</p>
                )}
              </div>
              <span className='text-muted-foreground text-meta shrink-0'>{tRoles(m.role)}</span>
            </PanelRow>
          ))}
        </PanelList>
      )}
      <PanelFooter>
        <Button asChild size='sm' variant='outline' className='w-full rounded-lg'>
          <Link href='/dashboard/members'>
            <Icons.add className='size-4' aria-hidden='true' />
            {t('members.invite')}
          </Link>
        </Button>
      </PanelFooter>
    </Panel>
  );
}
