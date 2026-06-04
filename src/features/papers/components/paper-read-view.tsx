'use client';

/**
 * PaperReadView — the PDF column for a paper.
 *
 * R237an: the side panel (Info / Citations / Ask AI) was moved up to
 * PapersWorkspace so it persists across paper switches. This component is now
 * just the PDF + its state plumbing (saved page/zoom/scroll), and accepts a
 * `jumpRequest` prop the workspace forwards from Ask AI citation clicks.
 *
 * @phase R237am foundation, R237an persistence
 */
import { useCallback, useEffect, useState } from 'react';
import { PdfViewer } from '@/features/papers/components/pdf-viewer';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';
import { usePaper } from '@/lib/firestore/queries/papers';

export function PaperReadView({
  paperId,
  active,
  jumpRequest
}: {
  paperId: string;
  active: boolean;
  jumpRequest?: { page: number; y?: number; highlight?: string; nonce: number };
}) {
  const { paper } = usePaper(paperId);

  const tabState = usePaperTabsStore((s) => s.getTab(paperId));
  const updatePdfState = usePaperTabsStore((s) => s.updatePdfState);
  const setTitle = usePaperTabsStore((s) => s.setTitle);

  useEffect(() => {
    if (paper?.title && tabState && tabState.title !== paper.title) {
      setTitle(paperId, paper.title);
    }
  }, [paper?.title, tabState, paperId, setTitle]);

  // R237ak: gate persisted state behind a mounted flag to avoid SSR/client
  // hydration mismatches on the PdfViewer toolbar values.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const effectiveTabState = mounted ? tabState : undefined;
  const savedPage = effectiveTabState?.pdf.page ?? 1;
  const savedZoom = effectiveTabState?.pdf.zoom ?? 1;
  const savedScrollTop = effectiveTabState?.pdf.scrollTop ?? 0;

  const handlePageChange = useCallback(
    (page: number) => updatePdfState(paperId, { page }),
    [paperId, updatePdfState]
  );
  const handleZoomChange = useCallback(
    (zoom: number) => updatePdfState(paperId, { zoom }),
    [paperId, updatePdfState]
  );
  const handleScrollChange = useCallback(
    (scrollTop: number) => updatePdfState(paperId, { scrollTop }),
    [paperId, updatePdfState]
  );

  return (
    <div className='h-full min-w-0 flex-1 overflow-hidden'>
      <PdfViewer
        key={paperId}
        paperId={paperId}
        embedded
        active={active}
        initialPage={savedPage}
        initialZoom={savedZoom}
        initialScrollTop={savedScrollTop}
        onPageChange={handlePageChange}
        onZoomChange={handleZoomChange}
        onScrollChange={handleScrollChange}
        jumpRequest={jumpRequest}
      />
    </div>
  );
}
