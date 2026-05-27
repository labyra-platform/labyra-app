'use client';

// R181-6: import react-pdf CSS layers for text + annotations
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

/**
 * Custom PDF viewer using react-pdf v10 (MIT license).
 *
 * Features:
 *   - Continuous scroll mode (all pages stacked vertically)
 *   - Page navigation (prev/next/jump-to)
 *   - Zoom in/out/reset (no re-render loop on zoom)
 *   - Fullscreen toggle
 *   - Download
 *   - Auto-refresh signed URL before expiry
 *
 * Architecture:
 *   - Dynamic import of react-pdf (PDF.js needs window)
 *   - PDF.js worker from /pdf-worker/pdf.worker.min.mjs
 *   - Page width tracked via window resize only (NOT ResizeObserver on
 *     scroll container — that causes feedback loop when zoom changes
 *     scrollbar visibility)
 *
 * @phase R181-6
 * @r181-6-applied
 */
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconLoader2,
  IconMinus,
  IconPlus,
  IconRefresh
} from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { usePaper } from '@/lib/firestore/queries/papers';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), {
  ssr: false
});
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

interface SignedUrlResponse {
  url: string;
  expiresAt: number;
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;

async function fetchSignedUrl(paperId: string): Promise<SignedUrlResponse> {
  // Wait for auth state to settle before reading currentUser
  const auth = getFirebaseAuth();
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((u) => {
        unsub();
        resolve(u);
      });
    });
  }
  if (!user) throw new Error('not_authenticated');
  const token = await user.getIdToken();
  const res = await fetch(`/api/papers/${paperId}/signed-download`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return (await res.json()) as SignedUrlResponse;
}

export function PdfViewer({
  paperId,
  embedded = false,
  initialPage,
  initialZoom,
  onPageChange,
  onZoomChange,
  active = true
}: {
  paperId: string;
  embedded?: boolean;
  /** R226: restore viewport when a tab is re-mounted. */
  initialPage?: number;
  initialZoom?: number;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  /** R227b: true when this tab is the visible one. A hidden (display:none) tab
   *  loses its scroll position; when it becomes visible again we re-scroll to
   *  the current page so it doesn't jump to the last page. */
  active?: boolean;
}) {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const { paper, loading: paperLoading } = usePaper(paperId);

  const [signed, setSigned] = useState<SignedUrlResponse | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [zoom, setZoom] = useState(initialZoom ?? 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  // R226b: gate reporting page/zoom to the store until the saved page has been
  // restored. Without this, when a tab re-mounts the freshly-loaded PDF briefly
  // sits at page 1, the IntersectionObserver reports 1, and that overwrites the
  // saved page in the store before we scroll to it — losing the reading position.
  const restoredRef = useRef(false);

  // Configure PDF.js worker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { pdfjs } = await import('react-pdf');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.mjs';
        if (!cancelled) setPdfReady(true);
      } catch (e) {
        console.error('PDF.js worker init failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed URL load + auto-refresh
  const loadSignedUrl = useCallback(async () => {
    try {
      setUrlError(null);
      const result = await fetchSignedUrl(paperId);
      setSigned(result);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : 'fetch_failed');
    }
  }, [paperId]);

  useEffect(() => {
    loadSignedUrl();
  }, [loadSignedUrl]);

  useEffect(() => {
    if (!signed) return;
    // AI-17: when the URL is already near/past expiry, msUntilRefresh can be ≤ 0.
    // Calling loadSignedUrl() immediately then updating `signed` re-runs this
    // effect, and if the refreshed URL is also near expiry (or the fetch is slow)
    // it busy-loops. Always wait at least a short floor so refresh is throttled.
    const msUntilRefresh = signed.expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    const delay = Math.max(5_000, msUntilRefresh);
    refreshTimer.current = setTimeout(loadSignedUrl, delay);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [signed, loadSignedUrl]);

  // R181-6: Track container width via window resize, NOT ResizeObserver.
  // ResizeObserver fires on internal page renders → feedback loop on zoom.
  // Window resize only fires on real layout changes.
  // R181-8: lock container width to PARENT (not clientWidth which shrinks
  // when horizontal scrollbar appears during zoom). Parent width = viewport
  // minus sidebar, stable regardless of internal scroll state.
  useLayoutEffect(() => {
    const measure = () => {
      const el = pagesContainerRef.current;
      if (!el || !el.parentElement) return;
      const w = el.parentElement.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - w) > 8 ? w : prev));
    };
    // Delay measure to allow DOM to settle after fullscreen toggle
    const id = setTimeout(measure, 50);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [pdfReady, isFullscreen]);

  // Page width = (containerWidth - padding) * zoom
  const pageWidth = useMemo(() => {
    const padding = 32;
    const available = Math.max(320, containerWidth - padding);
    return available * zoom;
  }, [containerWidth, zoom]);

  // R225: virtualization window. Rendering all N pages (each with text +
  // annotation layers) is the dominant performance cost — 20-66 live PDF.js
  // canvases lag scroll badly. Only render pages within ±VIRTUAL_BUFFER of the
  // current page; everything else is a same-size placeholder so scroll height
  // (and thus scroll position / page jumps) stays exact. A4 aspect ≈ 1.414.
  const VIRTUAL_BUFFER = 2;
  const PAGE_ASPECT = Math.SQRT2;
  const placeholderHeight = pageWidth * PAGE_ASPECT;

  // Document load callback
  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      // R226: restore the tab's saved page (clamped) instead of forcing page 1.
      const target = Math.min(Math.max(1, initialPage ?? 1), n);
      setCurrentPage(target);
      if (target > 1) {
        // Wait for pages to mount before scrolling to the restored page.
        setTimeout(() => {
          const el = pagesContainerRef.current;
          el?.querySelector<HTMLElement>(`[data-page-index="${target}"]`)?.scrollIntoView();
          // Restore done — from now on, scrolling reports to the store.
          restoredRef.current = true;
        }, 150);
      } else {
        restoredRef.current = true;
      }
    },
    [initialPage]
  );

  // R226: report viewport changes to the parent (tab store), but only AFTER the
  // saved page is restored (restoredRef) so the restore itself isn't clobbered.
  useEffect(() => {
    if (restoredRef.current) onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);
  useEffect(() => {
    if (restoredRef.current) onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  // R227b: a hidden (display:none) tab loses its scroll offset. When this tab
  // becomes visible again, re-scroll to the page it was on. Without this, the
  // restored layout makes the IntersectionObserver fire for whatever page now
  // sits in the (reset) viewport — typically the last/near-last page — and the
  // view jumps there. We briefly gate reporting so that transient jump doesn't
  // overwrite the saved page.
  useEffect(() => {
    if (!active || !numPages || !pdfReady) return;
    const el = pagesContainerRef.current;
    if (!el) return;
    restoredRef.current = false;
    const id = setTimeout(() => {
      const target = el.querySelector<HTMLElement>(`[data-page-index="${currentPage}"]`);
      target?.scrollIntoView({ block: 'start' });
      setTimeout(() => {
        restoredRef.current = true;
      }, 120);
    }, 50);
    return () => clearTimeout(id);
    // Only re-run when the tab's visibility flips; currentPage is read live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, numPages, pdfReady]);

  // Page intersection observer → update currentPage as user scrolls
  // Deps only on numPages (functional setState avoids currentPage dep loop)
  useEffect(() => {
    if (!numPages || !pagesContainerRef.current) return;
    const root = pagesContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let bestIdx: number | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx = Number((entry.target as HTMLElement).dataset.pageIndex ?? 1);
          }
        }
        if (bestIdx !== null) {
          const target = bestIdx;
          setCurrentPage((prev) => (prev !== target ? target : prev));
        }
      },
      { root, threshold: [0.3, 0.7] }
    );
    const pages = root.querySelectorAll('[data-page-index]');
    pages.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [numPages]);

  // Jump-to-page
  const scrollToPage = useCallback((pageNum: number) => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-page-index="${pageNum}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentPage((prev) => {
      if (prev > 1) {
        scrollToPage(prev - 1);
        return prev - 1;
      }
      return prev;
    });
  }, [scrollToPage]);

  const goNext = useCallback(() => {
    setCurrentPage((prev) => {
      if (prev < numPages) {
        scrollToPage(prev + 1);
        return prev + 1;
      }
      return prev;
    });
  }, [numPages, scrollToPage]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // R181-8: don't set state manually — fullscreenchange listener handles it.
    // Manual setIsFullscreen(true) before browser fires event causes race.
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard shortcuts — deps stable thanks to useCallback above
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, zoomIn, zoomOut, resetZoom]);

  const displayTitle = useMemo(() => paper?.title || t('untitled'), [paper?.title, t]);

  // PDF file source — useMemo to avoid Document re-mount loop
  const fileSource = useMemo(() => (signed?.url ? { url: signed.url } : null), [signed?.url]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-muted/20 w-full min-w-0 max-w-full overflow-hidden',
        isFullscreen ? 'h-screen' : embedded ? 'h-full' : 'h-[calc(100vh-4rem)]'
      )}
    >
      {/* Toolbar */}
      <header className='flex items-center gap-1.5 border-b bg-background px-3 py-2 sm:gap-2 sm:px-4'>
        <Button asChild variant='ghost' size='sm'>
          <Link
            href={
              embedded ? `/${locale}/dashboard/papers` : `/${locale}/dashboard/papers/${paperId}`
            }
            aria-label={embedded ? t('backToList') : t('backToDetail')}
          >
            <IconArrowLeft className='size-4' />
            <span className='hidden sm:inline'>
              {embedded ? t('backToList') : t('backToDetail')}
            </span>
          </Link>
        </Button>

        <div className='min-w-0 flex-1 max-w-md'>
          <h1 className='truncate text-sm font-medium' title={displayTitle}>
            {paperLoading ? t('loading') : displayTitle}
          </h1>
          {paper && (
            <p className='truncate text-xs text-muted-foreground'>
              {numPages > 0
                ? t('pageOfTotal', { current: currentPage, total: numPages })
                : t('nPages', { count: paper.pageCount })}
              {' · '}
              {(paper.fileSize / 1024 / 1024).toFixed(2)} MB · v{paper.version}
            </p>
          )}
        </div>

        {/* Page nav */}
        <div className='hidden items-center gap-1 sm:flex'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={goPrev}
            disabled={currentPage <= 1}
            aria-label={t('prevPage')}
            title={t('prevPage')}
          >
            <IconChevronLeft className='size-4' />
          </Button>
          <input
            type='number'
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= numPages) {
                setCurrentPage(v);
                scrollToPage(v);
              }
            }}
            className='w-14 rounded border px-1.5 py-0.5 text-center text-sm'
            aria-label={t('currentPage')}
          />
          <span className='text-xs text-muted-foreground'>/ {numPages || '—'}</span>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={goNext}
            disabled={currentPage >= numPages}
            aria-label={t('nextPage')}
            title={t('nextPage')}
          >
            <IconChevronRight className='size-4' />
          </Button>
        </div>

        {/* Zoom */}
        <div className='flex items-center gap-0.5'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t('zoomOut')}
            title={t('zoomOut')}
          >
            <IconMinus className='size-4' />
          </Button>
          <button
            type='button'
            onClick={resetZoom}
            className='min-w-[3rem] rounded px-1.5 py-1 text-xs hover:bg-muted'
            title={t('resetZoom')}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t('zoomIn')}
            title={t('zoomIn')}
          >
            <IconPlus className='size-4' />
          </Button>
        </div>

        {/* Fullscreen */}
        <Button
          variant='ghost'
          size='icon'
          className='size-7'
          onClick={toggleFullscreen}
          aria-label={t('fullscreen')}
          title={t('fullscreen')}
        >
          {isFullscreen ? (
            <IconArrowsMinimize className='size-4' />
          ) : (
            <IconArrowsMaximize className='size-4' />
          )}
        </Button>

        {/* Download */}
        {signed?.url && (
          <Button asChild variant='outline' size='sm'>
            <a href={signed.url} download rel='noopener noreferrer' aria-label={t('download')}>
              <IconDownload className='size-4' />
              <span className='hidden md:inline'>{t('download')}</span>
            </a>
          </Button>
        )}
      </header>

      {/* Body */}
      <div
        ref={pagesContainerRef}
        className='flex-1 overflow-auto'
        style={{ scrollbarGutter: 'stable' }}
      >
        {urlError && (
          <div className='mx-auto max-w-2xl p-6'>
            <Alert variant='destructive'>
              <IconAlertCircle className='size-4' />
              <AlertTitle>{t('pdfLoadFailed')}</AlertTitle>
              <AlertDescription className='mt-2 space-y-3'>
                <p className='text-sm'>{urlError}</p>
                <Button variant='outline' size='sm' onClick={loadSignedUrl}>
                  <IconRefresh className='mr-1 size-3.5' />
                  {t('retry')}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!urlError && (!signed || !pdfReady) && (
          <div className='flex h-full justify-center py-4'>
            <Skeleton
              className='w-full max-w-2xl rounded-md'
              style={{ aspectRatio: '1 / 1.414' }}
            />
          </div>
        )}

        {!urlError && signed && pdfReady && fileSource && (
          <div className='py-4'>
            <Document
              file={fileSource}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className='flex h-32 items-center justify-center'>
                  <IconLoader2 className='size-5 animate-spin' />
                </div>
              }
              error={
                <Alert variant='destructive' className='mx-auto max-w-2xl'>
                  <AlertDescription>{t('pdfLoadFailed')}</AlertDescription>
                </Alert>
              }
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                const inWindow = Math.abs(pageNum - currentPage) <= VIRTUAL_BUFFER;
                return (
                  <div key={pageNum} data-page-index={pageNum} className='mb-4 flex justify-center'>
                    {inWindow ? (
                      <Page
                        pageNumber={pageNum}
                        width={pageWidth}
                        renderTextLayer
                        renderAnnotationLayer
                        className='shadow-md'
                        loading={
                          <div
                            className='flex items-center justify-center bg-card'
                            style={{ width: pageWidth, height: placeholderHeight }}
                          >
                            <IconLoader2 className='size-5 animate-spin text-muted-foreground' />
                          </div>
                        }
                      />
                    ) : (
                      // R225: out-of-window placeholder — same footprint, no canvas.
                      <div
                        className='flex items-center justify-center bg-card/50 shadow-md'
                        style={{ width: pageWidth, height: placeholderHeight }}
                      >
                        <span className='text-xs text-muted-foreground'>{pageNum}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
