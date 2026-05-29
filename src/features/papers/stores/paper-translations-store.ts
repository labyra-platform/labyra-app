import { create } from 'zustand';

/**
 * Paper translations (R237av — side-by-side B2).
 *
 * When the user Ctrl+drags a region and it's translated, the result is pushed
 * here so the reader's "Bản dịch / Translations" side-panel tab can list every
 * translated snippet for the paper (source left / translation right) and jump
 * back to the original region on click. This is the companion to the on-page
 * floating panel — the panel is the immediate view, this is the running list.
 *
 * Session-scoped (not persisted): translations are cheap to re-create from the
 * cache and keeping potentially-large bodies out of localStorage avoids bloat.
 * The store is global, so it survives switching between paper tabs (the records
 * are keyed by paperId); a full reload clears it.
 */

export interface TranslationRecord {
  id: string;
  /** 1-based page the region sits on. */
  page: number;
  /** Original text pulled from the region. */
  source: string;
  /** Translated text (clean — no ellipsis). */
  translation: string;
  /** True when the region starts/ends mid-sentence (the source selection was
   *  cut off). Rendered as a faint "…" so the user sees the system detected it,
   *  without polluting the copyable text. */
  partialStart: boolean;
  partialEnd: boolean;
  /** Vertical position of the region in the page (0..1), for scroll-to-region. */
  yRatio: number;
  createdAt: number;
}

interface PaperTranslationsState {
  byPaper: Record<string, TranslationRecord[]>;
  /** Add a translation for a paper, newest-first. Re-translating the same
   *  region (same page + same source text) replaces the old entry. */
  add: (paperId: string, rec: Omit<TranslationRecord, 'id' | 'createdAt'>) => void;
  remove: (paperId: string, id: string) => void;
  clear: (paperId: string) => void;
}

export const usePaperTranslationsStore = create<PaperTranslationsState>((set) => ({
  byPaper: {},
  add: (paperId, rec) =>
    set((s) => {
      const list = s.byPaper[paperId] ?? [];
      const deduped = list.filter((r) => !(r.page === rec.page && r.source === rec.source));
      const next: TranslationRecord = {
        ...rec,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now()
      };
      return { byPaper: { ...s.byPaper, [paperId]: [next, ...deduped] } };
    }),
  remove: (paperId, id) =>
    set((s) => ({
      byPaper: {
        ...s.byPaper,
        [paperId]: (s.byPaper[paperId] ?? []).filter((r) => r.id !== id)
      }
    })),
  clear: (paperId) =>
    set((s) => {
      const next = { ...s.byPaper };
      delete next[paperId];
      return { byPaper: next };
    })
}));
