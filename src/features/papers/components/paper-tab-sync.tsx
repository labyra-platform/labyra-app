'use client';

/**
 * PaperTabSync — registers/activates the tab for a deep-linked or directly
 * navigated paper id, then renders nothing (the reader lives in the workspace).
 *
 * Covers: opening a paper by URL (deep-link / reload) when it isn't in the tab
 * set yet, and re-activating it when navigating to /papers/[id].
 *
 * @phase R227
 */
import { useEffect } from 'react';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';

export function PaperTabSync({ paperId }: { paperId: string }) {
  const openTab = usePaperTabsStore((s) => s.openTab);
  const setActive = usePaperTabsStore((s) => s.setActive);
  const hasTab = usePaperTabsStore((s) => s.tabs.some((t) => t.paperId === paperId));

  useEffect(() => {
    if (hasTab) setActive(paperId);
    else openTab(paperId);
  }, [paperId, hasTab, setActive, openTab]);

  return null;
}
