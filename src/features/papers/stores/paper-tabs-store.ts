import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Paper reading tabs — open multiple papers as tabs in the reader.
 *
 * Architecture (R226):
 *   - ALL durable per-tab state lives HERE, not inside React components. The
 *     reader view (PaperReadView) and PdfViewer are pure views: they read their
 *     initial state from this store and report changes back. This is what makes
 *     "unmount inactive tabs" safe — unmounting a tab's heavy react-pdf instance
 *     never loses page/zoom/scroll/chat/translation, because none of that is
 *     held in the component. Re-mounting reads it straight back from the store.
 *   - Persisted to localStorage so the full tab set survives a reload; the URL
 *     separately carries the active tab id for deep-linking (handled in the page).
 *
 * Per-tab state is intentionally extensible. R226 implements `pdf` and
 * `activePanelTab`. The `ai`, `translation`, and `selection` fields are reserved
 * now (typed, optional) so adding the AI-assistant and translate-on-selection
 * features later only fills these in — no store refactor, no data loss on tab
 * switch.
 */

export type PanelTab = 'info' | 'citations' | 'ai';

/** PDF viewport state for one tab — restored when the tab is re-mounted. */
export interface TabPdfState {
  page: number;
  zoom: number;
  scrollTop: number;
}

/** Reserved (R227+): per-tab AI assistant conversation. */
export interface TabAiState {
  // conversationId?: string;
  // draft?: string;
  [k: string]: unknown;
}

/** Reserved (R227+): per-tab translation overlay state. */
export interface TabTranslationState {
  [k: string]: unknown;
}

/** Reserved (R227+): text selection on the PDF (for ask-AI / translate). */
export interface TabSelectionState {
  // pageNumber?: number;
  // text?: string;
  [k: string]: unknown;
}

export interface PaperTab {
  paperId: string;
  /** Cached title for the tab label; refreshed when the paper doc loads. */
  title?: string;
  pdf: TabPdfState;
  activePanelTab: PanelTab;
  /** R230: id of the tab group this tab belongs to, or null/undefined if loose. */
  groupId?: string | null;
  ai?: TabAiState;
  translation?: TabTranslationState;
  selection?: TabSelectionState;
}

/** R230: Edge-style tab group color tokens (key stored, mapped to classes in UI). */
export type TabGroupColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
export const TAB_GROUP_COLORS: readonly TabGroupColor[] = [
  'blue',
  'green',
  'amber',
  'red',
  'purple',
  'gray'
];

/** R230: a named, colored, collapsible group of tabs. */
export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

const DEFAULT_PDF: TabPdfState = { page: 1, zoom: 1, scrollTop: 0 };

/**
 * Max open tabs. Even with inactive tabs unmounted, capping protects against
 * runaway memory and an unusable tab strip. Opening beyond the cap evicts the
 * least-recently-active tab.
 */
export const MAX_TABS = 8;

interface PaperTabsState {
  tabs: PaperTab[];
  activeTabId: string | null;
  /** Recency order of paperIds (most-recent last) for LRU eviction. */
  recency: string[];
  /** R230: tab groups. */
  groups: TabGroup[];

  openTab: (paperId: string, title?: string) => void;
  closeTab: (paperId: string) => void;
  setActive: (paperId: string) => void;
  setTitle: (paperId: string, title: string) => void;
  updatePdfState: (paperId: string, partial: Partial<TabPdfState>) => void;
  setPanelTab: (paperId: string, panelTab: PanelTab) => void;
  reorderTabs: (fromId: string, toId: string) => void;
  /**
   * R177-2 drag: move `fromId` to `toId`'s slot AND adopt the destination's
   * groupId in one atomic update. This is how Edge handles drag in/out of a
   * group — position decides membership. `targetGroupId` overrides the inferred
   * group (used when dropping into the empty tail of a collapsed/edge zone).
   */
  moveTab: (fromId: string, toId: string, targetGroupId?: string | null) => void;
  getTab: (paperId: string) => PaperTab | undefined;

  // R231: in-memory signed-URL cache (NOT persisted — URLs are short-lived and
  // sensitive). Lets re-opening a paper in the same session skip the
  // sign-API round-trip when the cached URL is still valid.
  signedUrls: Record<string, { url: string; expiresAt: number }>;
  getSignedUrl: (paperId: string) => { url: string; expiresAt: number } | null;
  setSignedUrl: (paperId: string, url: string, expiresAt: number) => void;

  // R230 group actions
  createGroup: (paperIds: string[], name?: string, color?: TabGroupColor) => string;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: TabGroupColor) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  addTabToGroup: (paperId: string, groupId: string) => void;
  removeTabFromGroup: (paperId: string) => void;
  closeGroup: (groupId: string) => void;
  ungroup: (groupId: string) => void;
}

function genId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Drop groups that no longer contain any tab (called after tab/group mutations). */
function pruneGroups(groups: TabGroup[], tabs: PaperTab[]): TabGroup[] {
  const used = new Set(tabs.map((t) => t.groupId).filter(Boolean));
  return groups.filter((g) => used.has(g.id));
}

function bumpRecency(recency: string[], paperId: string): string[] {
  return [...recency.filter((id) => id !== paperId), paperId];
}

export const usePaperTabsStore = create<PaperTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      recency: [],
      groups: [],
      signedUrls: {},

      openTab: (paperId, title) =>
        set((state) => {
          const existing = state.tabs.find((t) => t.paperId === paperId);
          if (existing) {
            // Already open → just activate (and refresh title if provided).
            return {
              activeTabId: paperId,
              recency: bumpRecency(state.recency, paperId),
              tabs: title
                ? state.tabs.map((t) => (t.paperId === paperId ? { ...t, title } : t))
                : state.tabs
            };
          }
          const newTab: PaperTab = {
            paperId,
            title,
            pdf: { ...DEFAULT_PDF },
            activePanelTab: 'info'
          };
          let tabs = [...state.tabs, newTab];
          let recency = bumpRecency(state.recency, paperId);
          // LRU eviction when over cap (never evict the one we just opened).
          while (tabs.length > MAX_TABS) {
            const victim = recency.find((id) => id !== paperId);
            if (!victim) break;
            tabs = tabs.filter((t) => t.paperId !== victim);
            recency = recency.filter((id) => id !== victim);
          }
          return { tabs, activeTabId: paperId, recency };
        }),

      closeTab: (paperId) =>
        set((state) => {
          const idx = state.tabs.findIndex((t) => t.paperId === paperId);
          if (idx === -1) return state;
          const tabs = state.tabs.filter((t) => t.paperId !== paperId);
          const recency = state.recency.filter((id) => id !== paperId);
          let activeTabId = state.activeTabId;
          if (activeTabId === paperId) {
            // Activate the most-recently-active remaining tab, else neighbor, else null.
            activeTabId =
              recency.toReversed().find((id) => tabs.some((t) => t.paperId === id)) ??
              tabs[Math.min(idx, tabs.length - 1)]?.paperId ??
              null;
          }
          return { tabs, recency, activeTabId, groups: pruneGroups(state.groups, tabs) };
        }),

      setActive: (paperId) =>
        set((state) => {
          if (!state.tabs.some((t) => t.paperId === paperId)) return state;
          return { activeTabId: paperId, recency: bumpRecency(state.recency, paperId) };
        }),

      setTitle: (paperId, title) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.paperId === paperId ? { ...t, title } : t))
        })),

      updatePdfState: (paperId, partial) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.paperId === paperId ? { ...t, pdf: { ...t.pdf, ...partial } } : t
          )
        })),

      setPanelTab: (paperId, panelTab) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.paperId === paperId ? { ...t, activePanelTab: panelTab } : t
          )
        })),

      reorderTabs: (fromId, toId) =>
        set((state) => {
          const from = state.tabs.findIndex((t) => t.paperId === fromId);
          const to = state.tabs.findIndex((t) => t.paperId === toId);
          if (from === -1 || to === -1 || from === to) return state;
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(to, 0, moved);
          return { tabs };
        }),

      moveTab: (fromId, toId, targetGroupId) =>
        set((state) => {
          const from = state.tabs.findIndex((t) => t.paperId === fromId);
          const to = state.tabs.findIndex((t) => t.paperId === toId);
          if (from === -1 || to === -1 || from === to) return state;
          // arrayMove semantics on the ORIGINAL indices: remove `from`, then
          // insert at `to` computed against the original positions. dnd-kit's
          // closestCenter already reports the slot the user is hovering, so
          // dragging right past a neighbour lands AFTER it (the previous
          // "insert before" logic always pushed left — R237e fix).
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(to, 0, moved);
          const destGroupId =
            targetGroupId !== undefined
              ? targetGroupId
              : (state.tabs.find((t) => t.paperId === toId)?.groupId ?? null);
          const finalTabs = tabs.map((t) =>
            t.paperId === fromId ? { ...t, groupId: destGroupId } : t
          );
          return { tabs: finalTabs, groups: pruneGroups(state.groups, finalTabs) };
        }),

      getTab: (paperId) => get().tabs.find((t) => t.paperId === paperId),

      // ---- R231 signed-URL cache ----
      getSignedUrl: (paperId) => {
        const entry = get().signedUrls[paperId];
        if (!entry) return null;
        // Treat as stale 30s before actual expiry so we never hand back a URL
        // that dies mid-load.
        if (entry.expiresAt - Date.now() < 30_000) return null;
        return entry;
      },
      setSignedUrl: (paperId, url, expiresAt) =>
        set((state) => ({
          signedUrls: { ...state.signedUrls, [paperId]: { url, expiresAt } }
        })),

      // ---- R230 group actions ----
      createGroup: (paperIds, name, color) => {
        const id = genId();
        set((state) => {
          const group: TabGroup = {
            id,
            name: name ?? '',
            color: color ?? TAB_GROUP_COLORS[state.groups.length % TAB_GROUP_COLORS.length],
            collapsed: false
          };
          const ids = new Set(paperIds);
          const tabs = state.tabs.map((t) => (ids.has(t.paperId) ? { ...t, groupId: id } : t));
          return { groups: [...state.groups, group], tabs };
        });
        return id;
      },

      renameGroup: (groupId, name) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g))
        })),

      setGroupColor: (groupId, color) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? { ...g, color } : g))
        })),

      toggleGroupCollapsed: (groupId) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
          )
        })),

      addTabToGroup: (paperId, groupId) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.paperId === paperId ? { ...t, groupId } : t))
        })),

      removeTabFromGroup: (paperId) =>
        set((state) => {
          const tabs = state.tabs.map((t) => (t.paperId === paperId ? { ...t, groupId: null } : t));
          return { tabs, groups: pruneGroups(state.groups, tabs) };
        }),

      closeGroup: (groupId) =>
        set((state) => {
          const tabs = state.tabs.filter((t) => t.groupId !== groupId);
          const removed = new Set(
            state.tabs.filter((t) => t.groupId === groupId).map((t) => t.paperId)
          );
          const recency = state.recency.filter((id) => !removed.has(id));
          let activeTabId = state.activeTabId;
          if (activeTabId && removed.has(activeTabId)) {
            activeTabId =
              recency.toReversed().find((id) => tabs.some((t) => t.paperId === id)) ??
              tabs[0]?.paperId ??
              null;
          }
          return {
            tabs,
            recency,
            activeTabId,
            groups: state.groups.filter((g) => g.id !== groupId)
          };
        }),

      ungroup: (groupId) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.groupId === groupId ? { ...t, groupId: null } : t)),
          groups: state.groups.filter((g) => g.id !== groupId)
        }))
    }),
    {
      name: 'labyra-paper-tabs',
      // SSR-safe: localStorage only exists in the browser. On the server this
      // returns a noop storage so Next.js hydration doesn't crash.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined
            }
      ),
      // Don't persist transient/reserved fields that may hold large data later
      // (ai conversation, selection); persist only the durable navigation state.
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          paperId: t.paperId,
          title: t.title,
          pdf: t.pdf,
          activePanelTab: t.activePanelTab,
          groupId: t.groupId ?? null
        })),
        activeTabId: state.activeTabId,
        recency: state.recency,
        groups: state.groups
      })
    }
  )
);
