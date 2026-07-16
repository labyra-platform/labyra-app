/**
 * Reader side-panel geometry — width, and whether it is collapsed.
 *
 * **localStorage, not Firestore.** A 1280 laptop and a 2560 external monitor
 * want different widths, and the same person uses both. This is a *device*
 * preference; syncing it would make one machine wrong every time the other was
 * right. (Contrast `users/{uid}/displayUnits`, which is about the person and
 * belongs on the account.)
 *
 * Width and collapse are stored separately on purpose: expanding returns the
 * panel to where it was left, not to the default. A collapse that forgets is a
 * collapse people stop using.
 *
 * @phase R530 — resizable AI panel
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Below this the panel cannot hold an answer with citations — see paper-ai-panel.md §2. */
export const PANEL_MIN = 280;
export const PANEL_DEFAULT = 320;

/**
 * The reader gets a floor rather than the panel getting a ceiling.
 *
 * paper-ai-panel.md §2 caps the panel at 60% of the split, and §5 immediately
 * doubts it: on a 1280 laptop that leaves the reader 512px, which will not hold
 * a two-column paper — and this library is full of them (Angew, Adv Funct
 * Mater). The constraint is really about the reader, so it is stated from the
 * reader's side. Both still apply: the floor binds on a laptop, the 60% binds
 * on a large monitor, and neither lets the other be violated.
 */
export const READER_FLOOR = 640;

export function panelMax(containerWidth: number): number {
  const byRatio = containerWidth * 0.6;
  const byFloor = containerWidth - READER_FLOOR;
  return Math.max(PANEL_MIN, Math.min(byRatio, byFloor));
}

export function clampPanel(width: number, containerWidth: number): number {
  return Math.round(Math.max(PANEL_MIN, Math.min(width, panelMax(containerWidth))));
}

interface ReaderPanelState {
  width: number;
  collapsed: boolean;
  setWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  reset: () => void;
}

export const useReaderPanelStore = create<ReaderPanelState>()(
  persist(
    (set) => ({
      width: PANEL_DEFAULT,
      collapsed: true,
      setWidth: (width) => set({ width }),
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      reset: () => set({ width: PANEL_DEFAULT })
    }),
    {
      name: 'labyra-reader-panel',
      // SSR-safe: localStorage only exists in the browser.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
      ),
      // R529's lesson: partialize is a whitelist, and anything left off it comes
      // back as its initial value. Both fields are durable, so both are listed.
      partialize: (state) => ({ width: state.width, collapsed: state.collapsed })
    }
  )
);
