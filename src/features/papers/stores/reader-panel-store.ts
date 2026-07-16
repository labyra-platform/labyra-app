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

/**
 * The width the panel has always been. It is the floor, not the default.
 *
 * paper-ai-panel.md §2 proposed 280, and R530 took it. That was wrong for this
 * app: 384px is what an answer with citations has been laid out for since the
 * panel existed, and letting it go narrower does not give anyone a better
 * panel — it gives them a broken one. The width people want to change is
 * upward.
 */
export const PANEL_MIN = 384;
export const PANEL_DEFAULT = 384;

/**
 * The reader's own floor, read out of the viewer rather than invented.
 *
 * `pdf-viewer.tsx` computes `pageWidth = max(320, containerWidth - 32) * zoom`.
 * The page fills the reader, so there is no empty margin for the panel to eat —
 * but the 320 is a hard stop: past it the page cannot shrink any further. That
 * is what "drag until the panel reaches the page's right edge" resolves to, and
 * it is a real constraint with a real source, unlike the 640 I picked in R530
 * and the 60% the mockup notes proposed. Both are gone.
 *
 * If the viewer's padding or floor changes, this must change with it — the two
 * numbers describe the same edge.
 */
const READER_MIN = 320 + 32;

export function panelMax(containerWidth: number): number {
  return Math.max(PANEL_MIN, containerWidth - READER_MIN);
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
