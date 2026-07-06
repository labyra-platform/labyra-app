/**
 * Reader chrome store — a single `collapsed` flag shared between the PDF viewer
 * (which drives it from scroll direction) and the workspace tab strip, so both
 * the toolbar and the tabs auto-hide while reading and reveal on scroll-up/hover.
 * Module-level, so it survives the reader's per-paper remount. @phase R402
 */
import { create } from 'zustand';

interface ReaderChromeState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const useReaderChromeStore = create<ReaderChromeState>((set) => ({
  collapsed: false,
  setCollapsed: (v) => set((s) => (s.collapsed === v ? s : { collapsed: v }))
}));
