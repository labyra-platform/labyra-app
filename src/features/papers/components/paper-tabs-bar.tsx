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
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconLayoutGrid, IconX } from '@tabler/icons-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type CSSProperties, Fragment, useState } from 'react';
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
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { TAB_GROUP_COLOR_STYLES } from '@/features/papers/lib/tab-group-colors';
import { formatSciNode } from '@/features/spectra/utils/format-units';
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

/** Drop-zone id for the empty space after the last tab. Dropping a grouped tab
 *  here is the way to pull it OUT of a group that has no tab to its right. */
const LOOSE_TAIL_ID = '__loose-tail__';

/** Flexible droppable filling the strip's trailing space. Highlights subtly
 *  while a tab hovers it so the "drop to ungroup" affordance is visible. */
function LooseTail() {
  const { setNodeRef, isOver } = useDroppable({ id: LOOSE_TAIL_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        'h-9 min-w-8 flex-1 self-end rounded-t-md transition-colors',
        isOver && 'bg-foreground/[0.06]'
      )}
    />
  );
}

/** Lock dragging to the X axis — tabs only move left/right, never up/down. */
const restrictToHorizontal: NonNullable<Parameters<typeof DndContext>[0]['modifiers']>[number] = ({
  transform
}) => ({ ...transform, y: 0 });

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
  const moveTab = usePaperTabsStore((s) => s.moveTab);

  // R177-2 drag: 6px activation distance so a plain click still opens the tab
  // (only a deliberate drag starts sorting).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    // Dropping on the tail zone moves the tab to the very end as a LOOSE tab —
    // the only way to leave a group that has no tab to its right (R237h fix).
    if (over.id === LOOSE_TAIL_ID) {
      const last = tabs[tabs.length - 1];
      if (last && last.paperId !== activeId) moveTab(activeId, last.paperId, null);
      else if (last && last.paperId === activeId) removeTabFromGroup(activeId);
      return;
    }
    if (activeId === over.id) return;
    // moveTab adopts the destination tab's group, so dragging across a group
    // boundary joins/leaves the group exactly like Edge.
    moveTab(activeId, String(over.id));
  };

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
  const sortableIds = tabs.map((tab) => tab.paperId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontal]}
      onDragEnd={onDragEnd}
    >
      {/* h-11 strip; tabs aligned to the BOTTOM so the active tab's top edge
          clears the group bar. No bottom padding so active tabs flare into the
          content surface below. */}
      <div className='flex h-11 w-full items-end overflow-hidden border-b bg-muted/40 pl-1'>
        {/* PARENT anchor — "Papers". A taller Edge-style tab; active on list route. */}
        <ParentTab
          active={onList}
          label={t('papersTitle')}
          ariaLabel={t('backToList')}
          onOpen={() => router.push(`/${locale}/dashboard/papers`)}
        />

        {tabs.length > 0 && !onList && <TabSep />}

        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {segments.map((seg, segIdx) => {
            if (seg.kind === 'loose') {
              const isActive = seg.tab.paperId === routePaperId;
              return (
                <Fragment key={seg.tab.paperId}>
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
                </Fragment>
              );
            }
            const { group, tabs: groupTabs } = seg;
            const styles = TAB_GROUP_COLOR_STYLES[group.color];
            const named = group.name.trim().length > 0;
            return (
              <div
                key={group.id}
                className='relative flex h-10 min-w-0 items-end rounded-t-md'
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
                      className='mx-1 inline-flex h-7 shrink-0 items-center gap-1.5 self-center rounded px-2 text-xs font-medium transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      style={styles.solidChip}
                    >
                      <span className='max-w-[10rem] truncate'>
                        {named ? group.name : t('tabGroupUnnamed')}
                      </span>
                      {/* R232b: count only when unnamed — a named group makes it noise. */}
                      {!named && (
                        <span className='tabular-nums opacity-80'>{groupTabs.length}</span>
                      )}
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
                    className='h-7 w-28 self-center text-xs'
                    aria-label={t('tabGroupRename')}
                  />
                )}

                {/* Group's tabs (hidden when collapsed) */}
                {!group.collapsed &&
                  groupTabs.map((tab, ti) => (
                    <Fragment key={tab.paperId}>
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
                    </Fragment>
                  ))}
              </div>
            );
          })}
        </SortableContext>
        <LooseTail />
      </div>
    </DndContext>
  );
}

/** Shared className for an Edge-style sheet tab body. h-9 = pdf-tab height. */
function tabSheetClass(active: boolean) {
  return cn(
    'edge-tab group relative flex h-9 items-center gap-1.5 px-3 text-xs transition-colors',
    active
      ? 'edge-tab-active z-10 -mx-px -mb-px bg-background font-medium text-foreground'
      : 'z-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
  );
}

/** The "Papers" parent tab — same Edge sheet shape, slightly taller, leads back
 *  to the list. Active on the list route. */
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
      className={cn(tabSheetClass(active), 'h-10 shrink-0 font-semibold')}
      style={active ? ({ '--edge-tab-bg': 'var(--background)' } as CSSProperties) : undefined}
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
  const setTitle = usePaperTabsStore((s) => s.setTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title ?? '');
  const commitTabRename = () => {
    const next = draft.trim();
    if (next) setTitle(tab.paperId, next);
    setEditing(false);
  };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.paperId
  });
  // Merge dnd transform with the active tab's --edge-tab-bg custom property.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { opacity: 0.5, zIndex: 50 } : null),
    ...(active ? ({ '--edge-tab-bg': 'var(--background)' } as CSSProperties) : null)
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          role='tab'
          tabIndex={0}
          aria-selected={active}
          onMouseDown={(e) => {
            // Middle-click closes the tab. Handle on mousedown and stop
            // propagation so the dnd-kit pointer listener never sees it —
            // auxclick alone is unreliable once drag listeners are attached.
            if (e.button === 1) {
              e.preventDefault();
              e.stopPropagation();
              onClose(e, tab.paperId);
            }
          }}
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
            tabSheetClass(active),
            // Edge behaviour: tabs share the row and shrink as more open
            // (flex-1 + min-w-0 so the title truncates, then disappears). Floor
            // ~3rem = file icon + close button only. Ceiling 14rem (~2.5x the
            // "Papers" tab) so one open tab doesn't stretch the whole strip. No
            // scrollbar — overflow is hidden, tabs just keep shrinking.
            'min-w-[3rem] max-w-[14rem] flex-1 cursor-pointer touch-none'
          )}
          style={style}
        >
          <Icons.pdfFile className='size-4 shrink-0' />
          {editing ? (
            <input
              ref={(el) => el?.focus()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={commitTabRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitTabRename();
                else if (e.key === 'Escape') setEditing(false);
              }}
              aria-label={t('renameTab')}
              className='min-w-0 flex-1 rounded-sm bg-background px-1 text-xs text-foreground outline-none ring-1 ring-primary/50'
            />
          ) : (
            <span className='min-w-0 flex-1 truncate'>
              {tab.title ? formatSciNode(tab.title) : t('untitled')}
            </span>
          )}
          <button
            type='button'
            onClick={(e) => onClose(e, tab.paperId)}
            aria-label={t('closeTab')}
            className={cn(
              // Title is flex-1 so it fills the gap and the X stays pinned to the
              // tab's right edge — a short title no longer pulls the X inward.
              'shrink-0 rounded p-0.5 transition-opacity hover:bg-foreground/10',
              active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
            )}
          >
            <IconX className='size-3' />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className='w-52'>
        <ContextMenuItem
          onSelect={() => {
            setDraft(tab.title ?? '');
            setEditing(true);
          }}
        >
          {t('renameTab')}
        </ContextMenuItem>
        <ContextMenuSeparator />
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
