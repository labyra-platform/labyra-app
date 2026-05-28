'use client';

/**
 * PapersWorkspace — persistent reader workspace (R227).
 *
 * Layout (top to bottom):
 *   - Tab strip (only when ≥1 tab is open). Always present across the list and
 *     reader routes so you never lose your open papers.
 *   - A stack of two layers in the same box:
 *       (a) `children` — the routed page (list, or the thin [id] sync page).
 *       (b) the readers — ONE PaperReadView per open tab, all kept mounted, with
 *           only the active tab visible (the rest `hidden`). Keeping them mounted
 *           is what makes tab switching instant: no react-pdf remount, no reload,
 *           live scroll/zoom/page preserved in the DOM.
 *
 * Which layer shows depends on the route:
 *   - On /papers (list): show children (the list), readers hidden underneath.
 *   - On /papers/[id]: show the matching reader, children (the thin sync page
 *     renders nothing) hidden.
 *
 * Only the active reader mounts its PDF (R232 single live reader); inactive
 * tabs are light metadata. With per-page virtualization and the pdf-cache LRU,
 * memory stays bounded without capping the number of open tabs (R237l).
 */
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { PaperReadView } from '@/features/papers/components/paper-read-view';
import { PaperTabsBar } from '@/features/papers/components/paper-tabs-bar';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';
import { cn } from '@/lib/utils';

/** Extract the active paperId from /<locale>/dashboard/papers/<id>[/view]. */
function paperIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/dashboard\/papers\/([^/]+)(?:\/view)?\/?$/);
  if (!m) return null;
  const seg = m[1];
  if (seg === 'upload') return null;
  return seg;
}

export function PapersWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const tabs = usePaperTabsStore((s) => s.tabs);

  // locale prefix for the tab bar links (/<locale>/dashboard/papers/...).
  const locale = useMemo(() => pathname.split('/').filter(Boolean)[0] ?? 'en', [pathname]);

  const routePaperId = paperIdFromPath(pathname);
  const onReader = routePaperId !== null;
  const hasTabs = tabs.length > 0;

  // R227: a hidden (display:none) PdfViewer measures containerWidth = 0. When a
  // tab becomes the active one (shown), tell it to re-measure so the page width
  // is correct. PdfViewer already listens on window.resize (R181).
  useEffect(() => {
    if (!onReader) return;
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [routePaperId, onReader]);

  return (
    <div className='flex h-[calc(100vh-4rem)] min-h-0 w-full flex-col'>
      {hasTabs && <PaperTabsBar locale={locale} />}

      <div className='relative min-h-0 flex-1'>
        {/* (a) routed content — list / sync page. Hidden (not unmounted) while a
            reader is showing so list scroll state is preserved when you return. */}
        <div className={cn('h-full min-h-0 overflow-auto', onReader && 'hidden')}>{children}</div>

        {/* (b) reader — R232: only the ACTIVE tab is mounted. Previously every
            open tab kept a live react-pdf instance (display:none), which piled
            up ~1.4k DOM nodes each → 8.4k nodes / 16 MB / multi-minute load with
            6 tabs. Now one reader lives at a time; switching unmounts the old
            one. Re-opening stays fast because the PDF bytes are kept in the
            module LRU cache (pdf-cache) and per-tab page/zoom/scroll in the
            store — so a remount skips the network and restores position. */}
        {onReader && routePaperId && (
          <div className='absolute inset-0'>
            <PaperReadView key={routePaperId} paperId={routePaperId} active />
          </div>
        )}
      </div>
    </div>
  );
}
