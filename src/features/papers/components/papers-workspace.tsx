'use client';

/**
 * PapersWorkspace — the dashboard/papers shell.
 *
 *  (a) PaperTabsBar — top strip of open paper tabs.
 *  (b) Reader column — ONE PaperReadView per visible tab.
 *  (c) Side panel  — persistent, lives outside PaperReadView (R237an) so it
 *      stays open and keeps its tab active when the user switches papers. The
 *      AskAiTab inside it remounts via key={paperId} to fetch the right thread.
 */
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PaperReadView } from '@/features/papers/components/paper-read-view';
import { PaperTabsBar } from '@/features/papers/components/paper-tabs-bar';
import { ReaderSidePanel } from '@/features/papers/components/reader-side-panel';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';
import { cn } from '@/lib/utils';

function paperIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/papers\/([^/]+)/);
  return m ? m[1] : null;
}

export function PapersWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const tabs = usePaperTabsStore((s) => s.tabs);

  const locale = useMemo(() => pathname.split('/').filter(Boolean)[0] ?? 'en', [pathname]);

  const routePaperId = paperIdFromPath(pathname);
  const onReader = routePaperId !== null;
  const hasTabs = tabs.length > 0;

  useEffect(() => {
    if (!onReader) return;
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [routePaperId, onReader]);

  // R237am: Ask AI citation jump bus. Lives here (not in PaperReadView) so the
  // side panel that drives jumps doesn't blink when papers are switched.
  const [jumpRequest, setJumpRequest] = useState<
    { page: number; y?: number; highlight?: string; nonce: number } | undefined
  >(undefined);
  const handleJumpToPage = useCallback((page: number, y?: number, highlight?: string) => {
    setJumpRequest({ page, y, highlight, nonce: Date.now() });
  }, []);

  return (
    <div className='flex h-[calc(100vh-4rem)] min-h-0 w-full flex-col'>
      {hasTabs && <PaperTabsBar locale={locale} />}

      <div className='relative min-h-0 flex-1'>
        <div className={cn('h-full min-h-0 overflow-auto', onReader && 'hidden')}>{children}</div>

        {/* Reader + persistent side panel. The PDF column re-mounts on paper
            switch (key); the side panel does not, so Ask AI / Info / Citations
            stays open and on the current tab as the user navigates. */}
        {onReader && routePaperId && (
          <div className='absolute inset-0 flex'>
            <PaperReadView
              key={routePaperId}
              paperId={routePaperId}
              active
              jumpRequest={jumpRequest}
            />
            <ReaderSidePanel paperId={routePaperId} onJumpToPage={handleJumpToPage} />
          </div>
        )}
      </div>
    </div>
  );
}
