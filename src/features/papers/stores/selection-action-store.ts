/**
 * Selection hand-off — what the reader's context menu passes to a panel tab.
 *
 * The menu lives on the PDF page and its targets live in the side panel, four
 * components away. Prop-drilling a transient gesture through pdf-viewer,
 * paper-read-view and reader-side-panel would put a callback in three files
 * that have no opinion about it; a store keeps the gesture between the two
 * places that care.
 *
 * **Not persisted.** This is one action in flight, and a selection restored
 * from localStorage after a reload would be a question the reader never asked,
 * appearing in a box they did not open. `consume()` is the only reader, and it
 * clears — an intent that fires twice is a bug, and one that survives the tab
 * it came from is a stranger one.
 *
 * @phase R539 — reader selection menu
 */
import { create } from 'zustand';

export type SelectionIntent = {
  kind: 'ask' | 'translate';
  text: string;
  /** Page the selection came from — the answer should be able to say where. */
  page: number;
  /** Distinguishes two identical selections; without it the second is a no-op. */
  at: number;
};

interface SelectionActionState {
  pending: SelectionIntent | null;
  send: (kind: SelectionIntent['kind'], text: string, page: number) => void;
  consume: () => SelectionIntent | null;
}

export const useSelectionActionStore = create<SelectionActionState>()((set, get) => ({
  pending: null,
  send: (kind, text, page) => set({ pending: { kind, text, page, at: Date.now() } }),
  consume: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  }
}));
