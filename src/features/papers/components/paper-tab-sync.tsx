'use client';

/**
 * PaperTabSync — registers/activates the tab for a deep-linked or directly
 * navigated paper id, then renders nothing (the reader lives in the workspace).
 *
 * R227d FIX: only sync ONCE per mounted paperId. Previously this reacted to
 * `hasTab`, which caused a close loop: closing the active tab removes it from
 * the store, but router.push('/papers') is async — for the few ms the route is
 * still /papers/[id], this component saw hasTab=false and immediately
 * re-opened the tab it had just closed. The user had to click × several times
 * until the route actually changed. Guarding with a ref so we open/activate
 * exactly once on mount (and when the id itself changes) breaks the loop:
 * closing a tab no longer races against a re-open.
 *
 * @phase R227 (loop fix R227d)
 */
import { useEffect, useRef } from 'react';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';

export function PaperTabSync({ paperId }: { paperId: string }) {
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (syncedFor.current === paperId) return;
    syncedFor.current = paperId;
    const store = usePaperTabsStore.getState();
    if (store.tabs.some((t) => t.paperId === paperId)) store.setActive(paperId);
    else store.openTab(paperId);
  }, [paperId]);

  return null;
}
