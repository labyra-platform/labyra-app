'use client';

/**
 * PaperTabsBar — horizontal tab strip for the paper reader (R226), with
 * Edge-style tab groups (R230).
 *
 * Layout: a "Papers" parent anchor (returns to the list), then the open papers
 * rendered in order. Consecutive tabs sharing a groupId are wrapped in a tinted
 * band led by a colored group chip (name + count). Collapsing a group hides its
 * tabs, leaving just the chip. Loose tabs render on their own.
 *
 * Interactions:
 *   - Left-click a tab → open it. Middle-click → close (browser convention).
 *   - Right-click a tab → context menu: new group / add to existing group /
 *     remove from group / close.
 *   - Click a group chip → toggle collapse. Right-click a chip → rename, recolor,
 *     ungroup, or close the whole group.
 *
 * Active state follows the URL (routePaperId), not the store, so the list route
 * shows the "Papers" parent active and no child highlighted.
 *
 * State lives in usePaperTabsStore; this is a view + light local UI state
 * (which group is being renamed).
 */
import { IconFileText, IconLayoutGrid, IconX } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { TAB_GROUP_COLOR_STYLES } from '@/features/papers/lib/tab-group-colors';
import {
  type PaperTab,
  type TabGroup,
  TAB_GROUP_COLORS,
  usePaperTabsStore
} from '@/features/papers/stores/paper-tabs-store';
import { cn } from '@/lib/utils';

/** Active paperId from /<locale>/dashboard/papers/<id>[/view]; null on the list. */
function paperIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/dashboard\/papers\/([^/]+)(?:\/view)?\/?$/);
  if (!m || m[1] === 'upload') return null;
  return m[1];
}

/** Group consecutive tabs by groupId into render segments. */
type Segment =
  | { kind: 'loose'; tab: PaperTab }
  | { kind: 'group'; group: TabGroup; tabs: PaperTab[] };

function buildSegments(tabs: PaperTab[], groups: TabGroup[]): Segment[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const segments: Segment[] = [];
  let i = 0;
  while (i < tabs.length) {
    const t = tabs[i];
    const gid = t.groupId;
    const group = gid ? byId.get(gid) : undefined;
    if (gid && group) {
      const run: PaperTab[] = [];
      while (i < tabs.length && tabs[i].groupId === gid) {
        run.push(tabs[i]);
        i++;
      }
      segments.push({ kind: 'group', group, tabs: run });
    } else {
      segments.push({ kind: 'loose', tab: t });
      i++;
    }
  }
  return segments;
}

export function PaperTabsBar({ locale }: { locale: string }) {
  const t = useTranslations('papers');
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const tabs = usePaperTabsStore((s) => s.tabs);
  const groups = usePaperTabsStore((s) => s.groups);
  const setActive = usePaperTabsStore((s) => s.setActive);
  const closeTab = usePaperTabsStore((s) => s.closeTab);
  const createGroup = usePaperTabsStore((s) => s.createGroup);
  const addTabToGroup = usePaperTabsStore((s) => s.addTabToGroup);
  const removeTabFromGroup = usePaperTabsStore((s) => s.removeTabFromGroup);
  const renameGroup = usePaperTabsStore((s) => s.renameGroup);
  const setGroupColor = usePaperTabsStore((s) => s.setGroupColor);
  const toggleGroupCollapsed = usePaperTabsStore((s) => s.toggleGroupCollapsed);
  const closeGroup = usePaperTabsStore((s) => s.closeGroup);
  const ungroup = usePaperTabsStore((s) => s.ungroup);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const routePaperId = paperIdFromPath(pathname);
  const onList = routePaperId === null;

  const goToTab = (paperId: string) => {
    setActive(paperId);
    if (routePaperId === paperId) return; // R227d: no duplicate history entry
    router.push(`/${locale}/dashboard/papers/${paperId}`);
  };

  const handleClose = (e: React.MouseEvent, paperId: string) => {
    e.stopPropagation();
    const wasActive = routePaperId === paperId;
    closeTab(paperId);
    if (wasActive) {
      const next = usePaperTabsStore.getState().activeTabId;
      router.push(next ? `/${locale}/dashboard/papers/${next}` : `/${locale}/dashboard/papers`);
    }
  };

  const startRename = (group: TabGroup) => {
    setRenaming(group.id);
    setRenameValue(group.name);
  };
  const commitRename = () => {
    if (renaming) renameGroup(renaming, renameValue.trim());
    setRenaming(null);
  };

  const segments = buildSegments(tabs, groups);

  return (
    <div className='flex h-11 w-full items-stretch gap-1 border-b bg-muted/30 px-2'>
      {/* PARENT anchor — "Papers". Active (lifted) when on the list route. */}
      <button
        type='button'
        onClick={() => router.push(`/${locale}/dashboard/papers`)}
        aria-current={onList ? 'page' : undefined}
        className={cn(
          'my-1.5 inline-flex shrink-0 items-center gap-2 rounded-md border-b-2 px-3 text-sm font-semibold transition-colors',
          onList
            ? 'border-primary bg-background text-foreground shadow-sm'
            : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
        aria-label={t('backToList')}
      >
        <IconLayoutGrid className='size-4' />
        {t('papersTitle')}
      </button>

      {tabs.length > 0 && <div className='my-2 w-px shrink-0 bg-border' />}

      <div className='flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto'>
        {segments.map((seg) => {
          if (seg.kind === 'loose') {
            return (
              <TabItem
                key={seg.tab.paperId}
                tab={seg.tab}
                active={seg.tab.paperId === routePaperId}
                groups={groups}
                t={t}
                onOpen={goToTab}
                onClose={handleClose}
                onNewGroup={(pid) => createGroup([pid])}
                onAddToGroup={addTabToGroup}
                onRemoveFromGroup={removeTabFromGroup}
              />
            );
          }
          const { group, tabs: groupTabs } = seg;
          const styles = TAB_GROUP_COLOR_STYLES[group.color];
          const named = group.name.trim().length > 0;
          return (
            <div
              key={group.id}
              className='my-1.5 flex items-stretch gap-1 rounded-md px-1'
              style={styles.band}
            >
              {/* Group chip — shadcn Badge for visual consistency. */}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type='button'
                    onClick={() => toggleGroupCollapsed(group.id)}
                    title={named ? group.name : t('tabGroupUnnamed')}
                    className='my-1 shrink-0 rounded transition-opacity hover:opacity-80 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  >
                    <Badge
                      variant='outline'
                      className='gap-1.5 px-2 py-0.5 text-xs font-medium'
                      style={styles.chip}
                    >
                      <span
                        className='size-2 shrink-0 rounded-full'
                        style={styles.dot}
                        aria-hidden
                      />
                      <span className='max-w-[10rem] truncate'>
                        {named ? group.name : t('tabGroupUnnamed')}
                      </span>
                      {/* R232b: count only when the group is unnamed — once it
                          has a name, the count is just noise. Edge does the same. */}
                      {!named && (
                        <span className='tabular-nums opacity-70'>{groupTabs.length}</span>
                      )}
                    </Badge>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className='w-48'>
                  <ContextMenuItem onSelect={() => startRename(group)}>
                    {t('tabGroupRename')}
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>{t('tabGroupColor')}</ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {TAB_GROUP_COLORS.map((c) => (
                        <ContextMenuItem key={c} onSelect={() => setGroupColor(group.id, c)}>
                          <span
                            className='mr-2 size-3 rounded-full'
                            style={TAB_GROUP_COLOR_STYLES[c].dot}
                            aria-hidden
                          />
                          {t(`tabGroupColor_${c}`)}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuItem onSelect={() => toggleGroupCollapsed(group.id)}>
                    {group.collapsed ? t('tabGroupExpand') : t('tabGroupCollapse')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => ungroup(group.id)}>
                    {t('tabGroupUngroup')}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => closeGroup(group.id)}
                    className='text-destructive focus:text-destructive'
                  >
                    {t('tabGroupCloseAll')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Inline rename input */}
              {renaming === group.id && (
                <Input
                  ref={(el) => el?.focus()}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className='my-1 h-7 w-28 text-xs'
                  aria-label={t('tabGroupRename')}
                />
              )}

              {/* Group's tabs (hidden when collapsed) */}
              {!group.collapsed &&
                groupTabs.map((tab) => (
                  <TabItem
                    key={tab.paperId}
                    tab={tab}
                    active={tab.paperId === routePaperId}
                    groups={groups}
                    t={t}
                    onOpen={goToTab}
                    onClose={handleClose}
                    onNewGroup={(pid) => createGroup([pid])}
                    onAddToGroup={addTabToGroup}
                    onRemoveFromGroup={removeTabFromGroup}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A single paper tab with its right-click context menu. */
function TabItem({
  tab,
  active,
  groups,
  t,
  onOpen,
  onClose,
  onNewGroup,
  onAddToGroup,
  onRemoveFromGroup
}: {
  tab: PaperTab;
  active: boolean;
  groups: TabGroup[];
  t: ReturnType<typeof useTranslations>;
  onOpen: (paperId: string) => void;
  onClose: (e: React.MouseEvent, paperId: string) => void;
  onNewGroup: (paperId: string) => void;
  onAddToGroup: (paperId: string, groupId: string) => void;
  onRemoveFromGroup: (paperId: string) => void;
}) {
  const otherGroups = groups.filter((g) => g.id !== tab.groupId);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role='tab'
          tabIndex={0}
          aria-selected={active}
          onClick={() => onOpen(tab.paperId)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onClose(e, tab.paperId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen(tab.paperId);
            }
          }}
          className={cn(
            // R235b: mỗi tab là 1 thẻ có viền + nền riêng -> ranh giới rõ ràng
            // giữa các tab (trước đây border-b-2 + transparent làm chúng dính
            // thành 1 khối). Active: nền sáng + viền primary trái. Inactive:
            // nền mờ + viền mảnh.
            'group relative my-1.5 flex min-w-[7rem] max-w-[16rem] flex-1 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
            active
              ? 'border-l-2 border-l-primary border-border bg-background font-medium text-foreground shadow-sm'
              : 'border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          )}
        >
          <IconFileText className='size-3.5 shrink-0 opacity-70' />
          <span className='truncate'>{tab.title || t('untitled')}</span>
          <button
            type='button'
            onClick={(e) => onClose(e, tab.paperId)}
            aria-label={t('closeTab')}
            className={cn(
              'ml-auto shrink-0 rounded p-0.5 transition-opacity hover:bg-muted',
              active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
            )}
          >
            <IconX className='size-3' />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className='w-52'>
        <ContextMenuItem onSelect={() => onNewGroup(tab.paperId)}>
          {t('tabGroupAddNew')}
        </ContextMenuItem>
        {otherGroups.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t('tabGroupAddTo')}</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {otherGroups.map((g) => (
                <ContextMenuItem key={g.id} onSelect={() => onAddToGroup(tab.paperId, g.id)}>
                  <span
                    className='mr-2 size-3 rounded-full'
                    style={TAB_GROUP_COLOR_STYLES[g.color].dot}
                    aria-hidden
                  />
                  {g.name || t('tabGroupUnnamed')}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {tab.groupId && (
          <ContextMenuItem onSelect={() => onRemoveFromGroup(tab.paperId)}>
            {t('tabGroupRemove')}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onClose({ stopPropagation() {} } as React.MouseEvent, tab.paperId)}
          className='text-destructive focus:text-destructive'
        >
          {t('closeTab')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
