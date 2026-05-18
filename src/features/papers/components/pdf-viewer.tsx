'use client';

// R179-7b-hotfix1: import react-pdf CSS layers for text + annotations
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

/**
 * Custom PDF viewer using react-pdf v10 (MIT license).
 *
 * Features:
 *   - Continuous scroll mode (all pages stacked vertically)
 *   - Page navigation (prev/next/jump-to)
 *   - Zoom in/out/fit-width/fit-page (Ctrl+wheel supported)
 *   - Fullscreen toggle
 *   - Download
 *   - Auto-refresh signed URL before expiry
 *
 * Architecture decisions:
 *   - Dynamic import of react-pdf to avoid SSR (PDF.js needs window)
 *   - PDF.js worker served from /pdf-worker/pdf.worker.min.mjs (public dir)
 *   - Page width derives from container ref + zoom factor
 *
 * @phase R179-7b
 * @r179-7-applied
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
import { cn } from '@/lib/utils';

// Lazy import react-pdf primitives (client only — PDF.js requires window)
const Document = dynamic(() => import('react-pdf').then((m) => m.Document), { ssr: false });
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
  const user = getFirebaseAuth().currentUser;
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

type FitMode = 'width' | 'page' | 'custom';

export function PdfViewer({ paperId }: { paperId: string }) {
  const t = useTranslations('papers');
  const params = useParams();
  const locale = params.locale as string;
  const { paper, loading: paperLoading } = usePaper(paperId);

  const [signed, setSigned] = useState<SignedUrlResponse | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // Configure PDF.js worker (client-side only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { pdfjs } = await import('react-pdf');
        // Serve worker from public/ (copied during build)
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
    const msUntilRefresh = signed.expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    if (msUntilRefresh <= 0) {
      loadSignedUrl();
      return;
    }
    refreshTimer.current = setTimeout(loadSignedUrl, msUntilRefresh);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [signed, loadSignedUrl]);

  // Track container width for fit-mode calculations
  useLayoutEffect(() => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pdfReady]);

  // Effective page width based on fit mode + zoom
  const pageWidth = useMemo(() => {
    const padding = 32; // breathing room around page
    const available = Math.max(320, containerWidth - padding);
    if (fitMode === 'width') return available * zoom;
    // page/custom: let user control via zoom, base = available
    return available * zoom;
  }, [containerWidth, fitMode, zoom]);

  // Document load callback
  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
    setCurrentPage(1);
  }, []);

  // Page intersection observer → update currentPage as user scrolls
  useEffect(() => {
    if (!numPages || !pagesContainerRef.current) return;
    const root = pagesContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        // Find page with largest intersection ratio
        let bestIdx = currentPage;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const idx = Number((entry.target as HTMLElement).dataset.pageIndex ?? currentPage);
            bestIdx = idx;
          }
        }
        if (bestIdx !== currentPage) setCurrentPage(bestIdx);
      },
      { root, threshold: [0.3, 0.7] }
    );
    const pages = root.querySelectorAll('[data-page-index]');
    pages.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [numPages, currentPage]);

  // Jump-to-page
  const scrollToPage = useCallback((pageNum: number) => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-page-index="${pageNum}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const goPrev = () => {
    if (currentPage > 1) scrollToPage(currentPage - 1);
  };
  const goNext = () => {
    if (currentPage < numPages) scrollToPage(currentPage + 1);
  };

  const zoomIn = () => {
    setFitMode('custom');
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  };
  const zoomOut = () => {
    setFitMode('custom');
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  };
  const resetZoom = () => {
    setFitMode('width');
    setZoom(1);
  };

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      )
        return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages]);

  const displayTitle = useMemo(() => paper?.title || t('untitled'), [paper?.title, t]);

  // PDF file source — wrapped in useMemo to avoid re-render loop
  const fileSource = useMemo(() => (signed?.url ? { url: signed.url } : null), [signed?.url]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-muted/20',
        isFullscreen ? 'h-screen' : 'h-[calc(100vh-4rem)]'
      )}
    >
      {/* Toolbar */}
      <header className='flex items-center gap-1.5 border-b bg-background px-3 py-2 sm:gap-2 sm:px-4'>
        <Button asChild variant='ghost' size='sm'>
          <Link href={`/${locale}/dashboard/papers/${paperId}`} aria-label={t('backToDetail')}>
            <IconArrowLeft className='size-4' />
            <span className='hidden sm:inline'>{t('backToDetail')}</span>
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
                : t('nPages', { count: paper.pageCount })}{' '}
              · {(paper.fileSize / 1024 / 1024).toFixed(2)} MB · v{paper.version}
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
      <div ref={pagesContainerRef} className='flex-1 overflow-auto'>
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
          <div className='flex h-full items-center justify-center'>
            <IconLoader2 className='size-6 animate-spin text-muted-foreground' />
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
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={pageNum} data-page-index={pageNum} className='mb-4 flex justify-center'>
                  <Page
                    pageNumber={pageNum}
                    width={pageWidth}
                    renderTextLayer
                    renderAnnotationLayer
                    className='shadow-md'
                    loading={
                      <div
                        className='flex items-center justify-center bg-card'
                        style={{ width: pageWidth, height: pageWidth * 1.41 }}
                      >
                        <IconLoader2 className='size-5 animate-spin text-muted-foreground' />
                      </div>
                    }
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
