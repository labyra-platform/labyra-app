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
import { useReaderChromeStore } from '@/features/papers/stores/reader-chrome-store';
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
  const chromeCollapsed = useReaderChromeStore((s) => s.collapsed);
  const setChromeCollapsed = useReaderChromeStore((s) => s.setCollapsed);

  useEffect(() => {
    if (!onReader) return;
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [onReader]);

  // R237am: Ask AI citation jump bus. Lives here (not in PaperReadView) so the
  // side panel that drives jumps doesn't blink when papers are switched.
  const [jumpRequest, setJumpRequest] = useState<
    { page: number; y?: number; highlight?: string; nonce: number } | undefined
  >(undefined);
  const handleJumpToPage = useCallback((page: number, y?: number, highlight?: string) => {
    setJumpRequest({ page, y, highlight, nonce: Date.now() });
  }, []);

  // Keep-alive: mount a tab's reader on first visit and keep it mounted while the
  // tab stays open, so switching tabs is instant (no PDF re-fetch / re-render),
  // Zotero-style. Only the active tab is visible; the rest are display:none.
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!routePaperId) return;
    setMountedIds((prev) => (prev.has(routePaperId) ? prev : new Set(prev).add(routePaperId)));
  }, [routePaperId]);
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.paperId));
    setMountedIds((prev) => {
      const next = new Set([...prev].filter((id) => open.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);
  const renderIds = useMemo(() => {
    const ids = tabs.map((t) => t.paperId).filter((pid) => mountedIds.has(pid));
    if (routePaperId && !ids.includes(routePaperId)) ids.push(routePaperId);
    return ids;
  }, [tabs, mountedIds, routePaperId]);

  return (
    <div
      className={cn(
        'flex min-h-0 w-full flex-col',
        onReader && chromeCollapsed ? 'h-[100dvh]' : 'h-[calc(100vh-4rem)]'
      )}
    >
      {hasTabs && (
        <div
          onMouseEnter={onReader ? () => setChromeCollapsed(false) : undefined}
          className={cn(
            'overflow-hidden transition-all duration-200',
            onReader && chromeCollapsed ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'
          )}
        >
          <PaperTabsBar locale={locale} />
        </div>
      )}

      <div className='relative min-h-0 flex-1'>
        {/* R529: pt-3 under the tab strip. §1 forbids spacing that encodes
            nothing, but this encodes something — the strip and the toolbar are
            different objects, and butted together they read as one control
            group that happens to be two rows. The gap is the boundary. */}
        <div className={cn('h-full min-h-0 overflow-auto pt-3', onReader && 'hidden')}>
          {children}
        </div>

        {/* Keep every visited tab's reader mounted; show only the active one.
            Switching tabs toggles CSS visibility — the PDF is never re-fetched or
            re-mounted, so it's instant. jumpRequest targets the active reader. */}
        {onReader && routePaperId && (
          <div className='absolute inset-0 flex'>
            <div className='relative min-w-0 flex-1'>
              {renderIds.map((pid) => (
                <div
                  key={pid}
                  className={cn(
                    'absolute inset-0 flex',
                    pid !== routePaperId && 'invisible pointer-events-none'
                  )}
                >
                  <PaperReadView
                    paperId={pid}
                    active={pid === routePaperId}
                    jumpRequest={pid === routePaperId ? jumpRequest : undefined}
                  />
                </div>
              ))}
            </div>
            <ReaderSidePanel paperId={routePaperId} onJumpToPage={handleJumpToPage} />
          </div>
        )}
      </div>
    </div>
  );
}
