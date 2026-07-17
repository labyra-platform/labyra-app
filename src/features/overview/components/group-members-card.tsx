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
import { useMemo, useState } from 'react';
import { Icons } from '@/components/icons';
import { Panel, PanelEmpty, PanelFooter, PanelList, PanelRow } from '@/components/ui-extra/panel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/lib/auth/use-claims';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { type GroupMember, useGroupRoster } from '../use-group-roster';

/**
 * R520: rank, not alphabet.
 *
 * The list arrived in whatever order the API returned, so the group lead could
 * land fifth — the one person you are most likely to be looking for, hidden in
 * the middle. Lead first, then by authority, then by name. Ties broken by name
 * so the order is stable between renders rather than shifting under the cursor.
 */
const RANK: Record<string, number> = { superadmin: 0, admin: 1, member: 2, viewer: 3 };

function byRank(a: GroupMember, b: GroupMember): number {
  if (a.isGroupLead !== b.isGroupLead) return a.isGroupLead ? -1 : 1;
  const ra = RANK[a.role] ?? 9;
  const rb = RANK[b.role] ?? 9;
  if (ra !== rb) return ra - rb;
  return (a.displayName || a.email).localeCompare(b.displayName || b.email);
}

/**
 * R542: `member` wears no chip.
 *
 * Most people in a lab are members — that is what the word is for. Printing it
 * beside every name says nothing and costs the two labels that do say
 * something the contrast they need to be seen. A chip is for what is *not* the
 * default; the default is the absence of one.
 *
 * admin keeps its chip even though the report only named superadmin and viewer:
 * those were the two roles in the screenshot, but the rule underneath is
 * "silence means member", and an admin is not a member.
 */
const ROLE_CHIP: Record<string, string> = {
  superadmin: 'border-primary/30 bg-primary/10 text-primary',
  admin: 'border-primary/30 bg-primary/10 text-primary',
  viewer: 'border-border bg-muted text-muted-foreground'
};

function initials(m: GroupMember): string {
  const src = (m.displayName || m.email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts.at(-1)![0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function GroupMembersCard() {
  const t = useTranslations('dashboard');
  const tRoles = useTranslations('common.roles');
  // Before any early return — this component has one for loading.
  const isAdmin = useIsAdmin();
  const [groupId, setGroupId] = useState<string | null>(null);
  const { group, members, groups, canSwitchGroup, isLoading } = useGroupRoster(groupId);
  const ranked = useMemo(() => members.toSorted(byRank), [members]);

  const showPicker = canSwitchGroup && groups.length > 1;
  const currentId = groupId ?? group?.id ?? '';

  return (
    <Panel
      title={t('members.title')}
      icon={Icons.teams}
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
      {/* Five rows, always — see --panel-viewport. Fixed, not max: the point
          is that the card stops resizing when you switch groups. Fewer than
          five leaves space; more scrolls. */}
      <div className='lb-viewport flex h-[var(--panel-viewport)] flex-col overflow-y-auto'>
        {isLoading ? (
          <div className='space-y-2'>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <PanelEmpty title={t('members.emptyTitle')} description={t('members.empty')} />
        ) : (
          <PanelList>
            {ranked.map((m) => (
              <PanelRow key={m.uid}>
                <Avatar className='size-8 shrink-0'>
                  <AvatarFallback className='text-meta'>{initials(m)}</AvatarFallback>
                </Avatar>
                <span className='text-body min-w-0 flex-1 truncate'>
                  {m.displayName || m.email}
                </span>
                {m.isGroupLead && (
                  <span className='bg-muted text-meta text-muted-foreground shrink-0 rounded-full px-2 py-0.5'>
                    {t('members.lead')}
                  </span>
                )}
                {ROLE_CHIP[m.role] && (
                  <span
                    className={cn(
                      'text-meta shrink-0 rounded-full border px-2 py-0.5',
                      ROLE_CHIP[m.role]
                    )}
                  >
                    {tRoles(m.role)}
                  </span>
                )}
              </PanelRow>
            ))}
          </PanelList>
        )}
      </div>
      <PanelFooter>
        {/* Two verbs, not one. "See all" is where you go to read the list;
            "Invite" is where you go to change it. They were one button doing
            both, which meant every look at the roster started with a word about
            adding to it. The count is on the link because a link that says how
            many is a different sentence from one that does not. */}
        <div className='flex items-center gap-2'>
          <Button asChild size='sm' variant='ghost' className='flex-1 rounded-lg'>
            <Link href='/dashboard/members'>{t('members.viewAll', { count: ranked.length })}</Link>
          </Button>
          {/* R565: admin only, because that is who can actually do it.
              firestore.rules gates /invites on isAdmin(), so this button offered
              a member an action the database refuses. R487 taught the sidebar to
              hide what you cannot reach and never told the dashboard, so the
              nav hid the members page while this card kept advertising it —
              click, and Firestore says no. A control the backend will reject is
              worse than no control: it reads as the app being broken rather
              than as permission being withheld. */}
          {isAdmin && (
            <Button asChild size='sm' variant='outline' className='rounded-lg'>
              <Link href='/dashboard/members'>
                <Icons.add className='size-4' aria-hidden='true' />
                {t('members.invite')}
              </Link>
            </Button>
          )}
        </div>
      </PanelFooter>
    </Panel>
  );
}
