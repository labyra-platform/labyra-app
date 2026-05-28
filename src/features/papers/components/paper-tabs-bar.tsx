'use client';

/**
 * PaperTabsBar — horizontal tab strip for the paper reader (R226), with
 * Edge-style tab groups (R230) and Edge-style tab *shape* (R237b).
 *
 * Layout: a "Papers" parent anchor (returns to the list), then the open papers
 * rendered in order. Consecutive tabs sharing a groupId are wrapped in a band
 * topped by a 2px group-colour bar and led by a solid group chip (name/count).
 * Collapsing a group hides its tabs, leaving just the chip. Loose tabs render
 * on their own, separated by short vertical seams.
 *
 * R237b visual model (match Microsoft Edge):
 *   - Tabs sit flush against each other; no gap, no per-tab pill border.
 *   - Inactive tabs are transparent and divided by short, centred separators.
 *   - The active tab is a "floating sheet": convex top corners + *concave*
 *     bottom corners (see `.edge-tab` in globals.css) that flare into the
 *     content surface below, made seamless with `-mb-px` + no bottom border +
 *     `z-10`. Its own background colour is fed to the concave pseudo-elements
 *     via the `--edge-tab-bg` custom property so the curve always matches.
 *   - The active tab's z-index lets it cover the separators on either side, so
 *     the seam disappears around it exactly like Edge — no index bookkeeping.
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
 */
import { IconFileText, IconLayoutGrid, IconX } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useState } from 'react';
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

/** Short vertical seam between two inactive tabs (hidden under the active one). */
function TabSep() {
  return <div className='edge-sep z-0 shrink-0' aria-hidden />;
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
    // h-10 strip; no bottom padding so active tabs can flare into the content.
    <div className='flex h-10 w-full items-stretch overflow-x-auto border-b bg-muted/40 pt-1.5 pl-2'>
      {/* PARENT anchor — "Papers". An Edge-style tab; active on the list route. */}
      <ParentTab
        active={onList}
        label={t('papersTitle')}
        ariaLabel={t('backToList')}
        onOpen={() => router.push(`/${locale}/dashboard/papers`)}
      />

      {tabs.length > 0 && !onList && <TabSep />}

      {segments.map((seg, segIdx) => {
        if (seg.kind === 'loose') {
          const isActive = seg.tab.paperId === routePaperId;
          return (
            <span key={seg.tab.paperId} className='flex items-stretch'>
              {segIdx > 0 && <TabSep />}
              <TabItem
                tab={seg.tab}
                active={isActive}
                groups={groups}
                t={t}
                onOpen={goToTab}
                onClose={handleClose}
                onNewGroup={(pid) => createGroup([pid])}
                onAddToGroup={addTabToGroup}
                onRemoveFromGroup={removeTabFromGroup}
              />
            </span>
          );
        }
        const { group, tabs: groupTabs } = seg;
        const styles = TAB_GROUP_COLOR_STYLES[group.color];
        const named = group.name.trim().length > 0;
        return (
          <div
            key={group.id}
            className='relative my-px flex items-stretch rounded-t-md'
            style={styles.band}
          >
            {/* 2px group-colour bar across the whole band (Edge group strip). */}
            <div
              className='absolute inset-x-0 top-0 h-0.5 rounded-t-md'
              style={styles.bar}
              aria-hidden
            />

            {/* Group chip — solid colour, white text (Edge style). */}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  type='button'
                  onClick={() => toggleGroupCollapsed(group.id)}
                  title={named ? group.name : t('tabGroupUnnamed')}
                  className='my-1 ml-1 inline-flex shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  style={styles.solidChip}
                >
                  <span className='max-w-[10rem] truncate'>
                    {named ? group.name : t('tabGroupUnnamed')}
                  </span>
                  {/* R232b: count only when unnamed — a named group makes it noise. */}
                  {!named && <span className='tabular-nums opacity-80'>{groupTabs.length}</span>}
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
              groupTabs.map((tab, ti) => (
                <span key={tab.paperId} className='flex items-stretch'>
                  {ti > 0 && <TabSep />}
                  <TabItem
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
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/** Shared className for an Edge-style sheet tab body. */
function tabSheetClass(active: boolean) {
  return cn(
    'edge-tab group relative flex items-center gap-1.5 px-3 text-xs transition-colors',
    active
      ? 'edge-tab-active z-10 -mb-px bg-background font-medium text-foreground shadow-[0_-1px_3px_hsl(0_0%_0%/0.08)]'
      : 'z-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
  );
}

/** The "Papers" parent tab — same Edge sheet shape as a paper tab. */
function ParentTab({
  active,
  label,
  ariaLabel,
  onOpen
}: {
  active: boolean;
  label: string;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onOpen}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      className={cn(tabSheetClass(active), 'shrink-0 font-semibold')}
      style={active ? ({ '--edge-tab-bg': 'hsl(var(--background))' } as CSSProperties) : undefined}
    >
      <IconLayoutGrid className='size-4 shrink-0' />
      {label}
    </button>
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
          className={cn(tabSheetClass(active), 'min-w-[8rem] max-w-[15rem] cursor-pointer')}
          style={
            active ? ({ '--edge-tab-bg': 'hsl(var(--background))' } as CSSProperties) : undefined
          }
        >
          <IconFileText className='size-3.5 shrink-0 opacity-70' />
          <span className='truncate'>{tab.title || t('untitled')}</span>
          <button
            type='button'
            onClick={(e) => onClose(e, tab.paperId)}
            aria-label={t('closeTab')}
            className={cn(
              'ml-auto shrink-0 rounded p-0.5 transition-opacity hover:bg-foreground/10',
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
