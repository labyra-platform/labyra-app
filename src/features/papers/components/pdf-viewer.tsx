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
  IconArrowBackUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconEraser,
  IconLoader2,
  IconMinus,
  IconPencil,
  IconPlus,
  IconRefresh
} from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getCachedPdf, setCachedPdf } from '@/features/papers/lib/pdf-cache';
import { PdfHighlightLayer } from '@/features/papers/components/pdf-highlight-layer';
import { PdfDrawLayer } from '@/features/papers/components/pdf-draw-layer';
import { PdfNavSidebar } from '@/features/papers/components/pdf-nav-sidebar';
import {
  createAnnotation,
  deleteAnnotation,
  subscribeAnnotations
} from '@/lib/firestore/queries/annotations';
import { useTenantId } from '@/lib/auth/use-claims';
import type {
  AnnotationColor,
  DrawingAnnotation,
  HighlightAnnotation,
  NormPoint,
  NormRect
} from '@/types/annotations';
import { usePaperTabsStore } from '@/features/papers/stores/paper-tabs-store';
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

/** Minimal PDFDocumentProxy surface used here + by the nav sidebar. */
interface PdfDocLike {
  numPages: number;
  getOutline: () => Promise<unknown[] | null>;
  getDestination: (id: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: object) => Promise<number>;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (params: { scale: number }) => { width: number; height: number };
  }>;
}

/** Pen palette for Draw mode (C4). Swatch = solid stroke preview color. */
const DRAW_COLORS: readonly AnnotationColor[] = ['pink', 'blue', 'green', 'orange', 'yellow'];
const DRAW_SWATCH: Record<AnnotationColor, string> = {
  pink: '#D81B60',
  blue: '#2962FF',
  green: '#00A152',
  orange: '#F4511E',
  yellow: '#F5B400'
};

/** Table-of-contents glyph (bulleted list) for the nav-sidebar toggle. Distinct
 *  from the panel collapse handle, which previously shared the sidebar icon. */
function TocIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.8}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      aria-hidden
    >
      <circle cx='5' cy='6' r='1.5' fill='currentColor' stroke='none' />
      <path d='M9 6h11' />
      <circle cx='5' cy='12' r='1.5' fill='currentColor' stroke='none' />
      <path d='M9 12h11' />
      <circle cx='9' cy='18' r='1.5' fill='currentColor' stroke='none' />
      <path d='M13 18h7' />
    </svg>
  );
}

/** Rotate glyph (circular arrow). Replaces the Tabler rotate icon (R237w). */
function RotateIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      className={className}
      aria-hidden
    >
      <path d='M21 12a9 9 0 1 1-3.3-6.95' />
      <path d='M21 4v4h-4' />
    </svg>
  );
}

// R231/R232: PDF.js document options. cMap + standardFonts enable correct
// rendering of embedded/CJK fonts; loaded from the bundled pdfjs-dist assets.
const PDF_OPTIONS = {
  cMapUrl: '/pdf-worker/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdf-worker/standard_fonts/'
} as const;
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
  initialScrollTop,
  onPageChange,
  onZoomChange,
  onScrollChange,
  active = true
}: {
  paperId: string;
  embedded?: boolean;
  /** R226: restore viewport when a tab is re-mounted. */
  initialPage?: number;
  initialZoom?: number;
  /** R237o: exact scroll offset (px) so re-opening a tab restores the precise
   *  reading position, not just the top of the saved page (Zotero-style). */
  initialScrollTop?: number;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onScrollChange?: (scrollTop: number) => void;
  /** R227b: true when this tab is the visible one. A hidden (display:none) tab
   *  loses its scroll position; when it becomes visible again we re-scroll to
   *  the current page so it doesn't jump to the last page. */
  active?: boolean;
}) {
  const t = useTranslations('papers');
  const { paper, loading: paperLoading } = usePaper(paperId);

  const [signed, setSigned] = useState<SignedUrlResponse | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  // R232: PDF binary. The reader mounts only the active tab, so re-opening a
  // tab pulls the already-downloaded bytes from the module-level LRU cache
  // (pdf-cache) instead of re-fetching from GCS. react-pdf gets file={{data}}.
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  // R232g: Blob URL cho <Document>. PDF.js KHÔNG detach Blob URL (fetch như
  // file thường), khác ArrayBuffer raw bị transfer/detach. Hết hẳn lớp
  // 'detached ArrayBuffer' khi component re-render giữa các lần load.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // R235 CLS fix: aspect ratio (height/width) thật của từng page. Placeholder
  // dùng aspect thật thay vì giả định A4 (SQRT2) -> page render không đổi
  // height -> hết layout shift. Pages cùng PDF thường cùng size nên 1 page
  // load xong là cả tài liệu có aspect đúng.
  const [pageAspects, setPageAspects] = useState<Record<number, number>>({});
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [zoom, setZoom] = useState(initialZoom ?? 1);
  // R237m: document-level rotation in degrees (0/90/180/270), like Edge's
  // rotate button. Applied to every Page; aspect ratios swap at 90/270.
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // R237n: live PDF proxy (for the nav sidebar's outline/thumbnails) + toggle.
  const [pdfProxy, setPdfProxy] = useState<PdfDocLike | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // C3b: private highlights for this paper (current user), live-subscribed.
  const tenantId = useTenantId();
  const [highlights, setHighlights] = useState<HighlightAnnotation[]>([]);
  // C4: freehand drawing. drawMode toggles pointer capture; while on, text
  // selection (highlight) is suppressed so the two tools don't fight.
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser'>('pen');
  const [drawColor, setDrawColor] = useState<AnnotationColor>('pink');
  const [drawings, setDrawings] = useState<DrawingAnnotation[]>([]);
  const DRAW_PEN_WIDTH = 0.004; // fraction of page width (~2-3px at typical zoom)
  const [pdfReady, setPdfReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
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

  // R232: load the PDF bytes (cache-first). Re-opening a visited tab reads the
  // ArrayBuffer from the module LRU cache — no network. First open fetches the
  // signed URL, downloads the bytes once, then caches them. We keep the bytes
  // (not the URL) so there's no expiry/refresh timer to run in the background.
  const loadPdf = useCallback(async () => {
    try {
      setUrlError(null);
      const cachedBytes = getCachedPdf(paperId);
      if (cachedBytes) {
        // R232a/f: hand the component a fresh slice. PDF.js transfers (detaches)
        // whatever ArrayBuffer it receives. If we kept the cache's master and
        // memoized fileSource on its reference, re-opening would hand PDF.js
        // the SAME (already-detached) slice from the previous mount. Slicing
        // here makes pdfData a brand-new buffer per load, so the cache master
        // stays intact for next time AND the fileSource memo recomputes.
        const objectUrl = URL.createObjectURL(
          new Blob([cachedBytes.slice(0)], { type: 'application/pdf' })
        );
        setPdfData(cachedBytes);
        setBlobUrl(objectUrl);
        return;
      }
      // Need a URL to download from. Reuse a still-valid cached URL (R231).
      let url = usePaperTabsStore.getState().getSignedUrl(paperId)?.url;
      if (!url) {
        const result = await fetchSignedUrl(paperId);
        usePaperTabsStore.getState().setSignedUrl(paperId, result.url, result.expiresAt);
        setSigned(result);
        url = result.url;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`pdf_fetch_${res.status}`);
      const buf = await res.arrayBuffer();
      // Cache the master, give react-pdf its own slice (see above).
      setCachedPdf(paperId, buf);
      const objectUrl = URL.createObjectURL(new Blob([buf.slice(0)], { type: 'application/pdf' }));
      setPdfData(buf);
      setBlobUrl(objectUrl);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : 'fetch_failed');
    }
  }, [paperId]);

  // R227d: the reader mounts only the active tab (R232), but keep the
  // gate — load the bytes once this tab is shown.
  const hasActivatedRef = useRef(false);
  if (active) hasActivatedRef.current = true;

  useEffect(() => {
    if (hasActivatedRef.current && !pdfData) loadPdf();
  }, [active, pdfData, loadPdf]);

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
  // R235: aspect đã đo (nếu có) hoặc fallback A4. Dùng aspect của page đầu
  // tiên đã biết làm default cho page chưa load (đa số PDF đồng nhất size).
  const knownAspects = Object.values(pageAspects);
  const defaultAspect = knownAspects.length > 0 ? knownAspects[0] : PAGE_ASPECT;
  // R237m: at 90°/270° the page is on its side, so the effective aspect (h/w)
  // inverts. Width stays = pageWidth; height uses the rotated aspect.
  const rotated90 = rotation % 180 !== 0;
  const aspectFor = (pageNum: number) => {
    const a = pageAspects[pageNum] ?? defaultAspect;
    return rotated90 ? 1 / a : a;
  };
  const heightForPage = (pageNum: number) => pageWidth * aspectFor(pageNum);

  // Document load callback. react-pdf hands us a PDFDocumentProxy; we only need
  // a small subset (PdfDocLike) so we cast for the sidebar + page count.
  const onDocumentLoadSuccess = useCallback(
    (pdf: { numPages: number }) => {
      const doc = pdf as unknown as PdfDocLike;
      const n = doc.numPages;
      setNumPages(n);
      setPdfProxy(doc);
      // R237o: restore the exact scroll offset (Zotero-style). Fall back to the
      // saved page's top when no offset was stored (older tabs / first open).
      const target = Math.min(Math.max(1, initialPage ?? 1), n);
      setCurrentPage(target);
      const restore = () => {
        const el = pagesContainerRef.current;
        if (el) {
          if (initialScrollTop && initialScrollTop > 0) {
            el.scrollTop = initialScrollTop;
          } else if (target > 1) {
            el.querySelector<HTMLElement>(`[data-page-index="${target}"]`)?.scrollIntoView();
          }
        }
        restoredRef.current = true;
      };
      if ((initialScrollTop && initialScrollTop > 0) || target > 1) {
        // Wait for pages to mount before restoring scroll.
        setTimeout(restore, 150);
      } else {
        restoredRef.current = true;
      }
    },
    [initialPage, initialScrollTop]
  );

  // C3b/C4: live-subscribe to this user's annotations for the paper, split by kind.
  useEffect(() => {
    if (!tenantId || !paperId) return;
    const unsub = subscribeAnnotations(tenantId, paperId, (anns) => {
      setHighlights(anns.filter((a): a is HighlightAnnotation => a.kind === 'highlight'));
      setDrawings(anns.filter((a): a is DrawingAnnotation => a.kind === 'drawing'));
    });
    return unsub;
  }, [tenantId, paperId]);

  const handleCreateHighlight = useCallback(
    (rects: NormRect[], text: string, color: AnnotationColor) => {
      if (!tenantId) return;
      createAnnotation(tenantId, paperId, { kind: 'highlight', rects, text, color }).catch(() => {
        // surfaced via UI later; swallow for now so a failed write doesn't crash
      });
    },
    [tenantId, paperId]
  );

  const handleCreateStroke = useCallback(
    (points: NormPoint[], strokeWidth: number, color: AnnotationColor, pageNumber: number) => {
      if (!tenantId) return;
      createAnnotation(tenantId, paperId, {
        kind: 'drawing',
        color,
        strokes: [{ page: pageNumber, points, width: strokeWidth }]
      }).catch(() => {});
    },
    [tenantId, paperId]
  );

  const handleDeleteDrawing = useCallback(
    (id: string) => {
      if (!tenantId) return;
      deleteAnnotation(tenantId, paperId, id).catch(() => {});
    },
    [tenantId, paperId]
  );

  // C4b: undo removes the most recently created drawing (by createdAt).
  const handleUndoDrawing = useCallback(() => {
    if (!tenantId || drawings.length === 0) return;
    const last = drawings.toSorted((a, b) => b.createdAt - a.createdAt)[0];
    if (last) deleteAnnotation(tenantId, paperId, last.id).catch(() => {});
  }, [tenantId, paperId, drawings]);

  const handleDeleteHighlight = useCallback(
    (id: string) => {
      if (!tenantId) return;
      deleteAnnotation(tenantId, paperId, id).catch(() => {});
    },
    [tenantId, paperId]
  );
  useEffect(() => {
    if (restoredRef.current) onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);
  useEffect(() => {
    if (restoredRef.current) onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  // R237o: report the exact scroll offset to the store as the user scrolls
  // (after restore). Light rAF throttle. This is what lets re-opening a tab
  // land on the precise position, not just the top of a page.
  useEffect(() => {
    const el = pagesContainerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (restoredRef.current) onScrollChange?.(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [onScrollChange, pdfReady]);

  // R227b: a hidden (display:none) tab loses its scroll offset. When this tab
  // becomes visible again, restore the exact saved offset (R237o) — falling
  // back to the current page's top. We briefly gate reporting so the transient
  // re-layout jump doesn't overwrite the saved position.
  useEffect(() => {
    if (!active || !numPages || !pdfReady) return;
    const el = pagesContainerRef.current;
    if (!el) return;
    restoredRef.current = false;
    const saved = initialScrollTop ?? 0;
    const id = setTimeout(() => {
      if (saved > 0) {
        el.scrollTop = saved;
      } else {
        el.querySelector<HTMLElement>(`[data-page-index="${currentPage}"]`)?.scrollIntoView({
          block: 'start'
        });
      }
      setTimeout(() => {
        restoredRef.current = true;
      }, 120);
    }, 50);
    return () => clearTimeout(id);
    // Only re-run when the tab's visibility flips; currentPage/scroll read live.
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
    if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, []);

  // R237t: jump so a destination INSIDE a page lands near the top of the
  // viewport (Edge/Adobe behaviour). yRatio is 0..1 from the page top; when null
  // we fall back to the page top. Uses scroll math (not scrollIntoView) so the
  // offset within the page is honored even when several headers share a page.
  const scrollToPageAt = useCallback((pageNum: number, yRatio?: number | null) => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-page-index="${pageNum}"]`);
    if (!target) return;
    if (yRatio == null) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    const containerTop = el.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const pageOffsetInScroll = el.scrollTop + (targetTop - containerTop);
    el.scrollTop = pageOffsetInScroll + yRatio * target.offsetHeight - 8;
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
  const rotateCw = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
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
  // R232f: pdfData is already a per-load slice (loadPdf above), so the memo
  // just wraps it. Each load → new pdfData reference → new fileSource → PDF.js
  // gets a fresh, not-yet-detached buffer; the cache's master is never touched.
  const fileSource = useMemo(() => blobUrl, [blobUrl]);
  // R232g: revoke Blob URL cũ khi đổi/unmount để không leak object URL.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

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
        {/* R237n: navigation sidebar toggle (thumbnails + outline). */}
        <Button
          variant={sidebarOpen ? 'secondary' : 'ghost'}
          size='icon'
          className='size-7 shrink-0'
          onClick={() => setSidebarOpen((o) => !o)}
          aria-pressed={sidebarOpen}
          aria-label={t('navToggle')}
          title={t('navToggle')}
        >
          <TocIcon className='size-4' />
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
          <span className='min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground'>
            {currentPage} / {numPages || '—'}
          </span>
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

        {/* Rotate (R237m) */}
        <Button
          variant='ghost'
          size='icon'
          className='size-7'
          onClick={rotateCw}
          aria-label={t('rotateClockwise')}
          title={t('rotateClockwise')}
        >
          <RotateIcon className='size-4' />
        </Button>

        {/* Draw (C4) — only meaningful at rotation 0 */}
        <Button
          variant={drawMode ? 'secondary' : 'ghost'}
          size='icon'
          className='size-7'
          onClick={() => setDrawMode((d) => !d)}
          disabled={rotation !== 0}
          aria-pressed={drawMode}
          aria-label={t('draw')}
          title={t('draw')}
        >
          <IconPencil className='size-4' />
        </Button>
        {drawMode && (
          <div className='flex items-center gap-1'>
            {/* Pen with a hover color palette + a top color indicator line. */}
            <div className='group relative'>
              <Button
                variant={drawTool === 'pen' ? 'secondary' : 'ghost'}
                size='icon'
                className='relative size-7 overflow-hidden'
                onClick={() => setDrawTool('pen')}
                aria-pressed={drawTool === 'pen'}
                aria-label={t('drawPen')}
                title={t('drawPen')}
              >
                <IconPencil className='size-4' />
                {/* color indicator at the top edge */}
                <span
                  className='absolute inset-x-1 top-0 h-[3px] rounded-b-sm'
                  style={{ backgroundColor: DRAW_SWATCH[drawColor] }}
                  aria-hidden
                />
              </Button>
              {/* Hover palette — only meaningful in pen mode. */}
              <div className='absolute left-1/2 top-full z-50 hidden -translate-x-1/2 pt-1 group-hover:block'>
                <div className='flex items-center gap-1.5 rounded-full border bg-popover px-2 py-1.5 shadow-lg'>
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      type='button'
                      onClick={() => {
                        setDrawColor(c);
                        setDrawTool('pen');
                      }}
                      className={cn(
                        'size-5 rounded-full border transition-transform hover:scale-110',
                        drawColor === c ? 'border-foreground' : 'border-black/10'
                      )}
                      style={{ backgroundColor: DRAW_SWATCH[c] }}
                      aria-label={`Pen ${c}`}
                      aria-pressed={drawColor === c}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Button
              variant={drawTool === 'eraser' ? 'secondary' : 'ghost'}
              size='icon'
              className='size-7'
              onClick={() => setDrawTool('eraser')}
              aria-pressed={drawTool === 'eraser'}
              aria-label={t('drawEraser')}
              title={t('drawEraser')}
            >
              <IconEraser className='size-4' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='size-7'
              onClick={handleUndoDrawing}
              disabled={drawings.length === 0}
              aria-label={t('drawUndo')}
              title={t('drawUndo')}
            >
              <IconArrowBackUp className='size-4' />
            </Button>
          </div>
        )}

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

        {/* Download — uses the signed URL (kept for this) if available. */}
        {signed?.url && (
          <Button asChild variant='outline' size='sm'>
            <a href={signed.url} download rel='noopener noreferrer' aria-label={t('download')}>
              <IconDownload className='size-4' />
              <span className='hidden md:inline'>{t('download')}</span>
            </a>
          </Button>
        )}
      </header>

      {/* Body + optional nav sidebar */}
      <div className='flex min-h-0 flex-1'>
        {sidebarOpen && (
          <PdfNavSidebar
            pdf={pdfProxy}
            fileUrl={fileSource}
            pdfOptions={PDF_OPTIONS}
            numPages={numPages}
            currentPage={currentPage}
            onJump={(p, yRatio) => {
              setCurrentPage(p);
              // Wait a frame so the target page is mounted (virtualization)
              // before measuring its offset for the precise scroll.
              requestAnimationFrame(() => scrollToPageAt(p, yRatio));
            }}
          />
        )}
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
                  <Button variant='outline' size='sm' onClick={loadPdf}>
                    <IconRefresh className='mr-1 size-3.5' />
                    {t('retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {!urlError && (!pdfData || !pdfReady) && (
            <div className='flex justify-center py-4'>
              {/* R235b: page-shaped skeleton — mô phỏng layout 1 trang paper
                (title + authors + paragraphs) trên nền giấy trắng, thay ô xám
                phẳng. Aspect 1/1.414 giữ CLS thấp khi PDF thật render vào. */}
              <div
                className='w-full max-w-2xl rounded-md bg-white p-[8%] shadow-md dark:bg-neutral-100'
                style={{ aspectRatio: '1 / 1.414' }}
              >
                <Skeleton className='mb-4 h-6 w-3/4 bg-neutral-200' />
                <Skeleton className='mb-6 h-3 w-1/2 bg-neutral-200' />
                <div className='space-y-2.5'>
                  {Array.from({ length: 12 }, (_, i) => (
                    <Skeleton
                      key={i}
                      className='h-2.5 bg-neutral-200'
                      style={{
                        width: `${[100, 96, 98, 90, 100, 94, 88, 100, 97, 70, 100, 85][i]}%`
                      }}
                    />
                  ))}
                </div>
                <Skeleton className='mt-6 mb-3 h-3 w-2/5 bg-neutral-200' />
                <div className='space-y-2.5'>
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton
                      key={i}
                      className='h-2.5 bg-neutral-200'
                      style={{ width: `${[100, 92, 98, 86, 100, 60][i]}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {!urlError && pdfReady && fileSource && (
            <div className='py-4'>
              <Document
                file={fileSource}
                options={PDF_OPTIONS}
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
                    <div
                      key={pageNum}
                      data-page-index={pageNum}
                      className='mb-4 flex justify-center'
                    >
                      {inWindow ? (
                        <div className='relative shadow-md' style={{ width: pageWidth }}>
                          <Page
                            pageNumber={pageNum}
                            width={pageWidth}
                            rotate={rotation}
                            renderTextLayer
                            renderAnnotationLayer
                            onLoadSuccess={(page) => {
                              // R235: store the UNROTATED aspect (h/w at rotation 0);
                              // aspectFor() inverts it for 90/270 placeholders.
                              const vp = page.getViewport({ scale: 1 });
                              const aspect = vp.height / vp.width;
                              setPageAspects((prev) =>
                                prev[pageNum] === aspect ? prev : { ...prev, [pageNum]: aspect }
                              );
                            }}
                            loading={
                              <div
                                className='flex items-center justify-center bg-card'
                                style={{ width: pageWidth, height: heightForPage(pageNum) }}
                              >
                                <IconLoader2 className='size-5 animate-spin text-muted-foreground' />
                              </div>
                            }
                          />
                          {/* C3b: highlight overlay — at rotation 0, when NOT
                              drawing (so the two tools don't fight for pointer). */}
                          {rotation === 0 && !drawMode && pageAspects[pageNum] && (
                            <PdfHighlightLayer
                              pageNumber={pageNum}
                              width={pageWidth}
                              height={pageWidth * pageAspects[pageNum]}
                              highlights={highlights}
                              onCreate={handleCreateHighlight}
                              onDelete={handleDeleteHighlight}
                            />
                          )}
                          {/* C4: drawing overlay — renders saved strokes always
                              (rotation 0); captures pointer only while drawMode. */}
                          {rotation === 0 && pageAspects[pageNum] && (
                            <PdfDrawLayer
                              pageNumber={pageNum}
                              width={pageWidth}
                              height={pageWidth * pageAspects[pageNum]}
                              drawings={drawings}
                              active={drawMode}
                              tool={drawTool}
                              color={drawColor}
                              penWidth={DRAW_PEN_WIDTH}
                              onCreateStroke={(points, w, c) =>
                                handleCreateStroke(points, w, c, pageNum)
                              }
                              onEraseStroke={handleDeleteDrawing}
                            />
                          )}
                        </div>
                      ) : (
                        // R225: out-of-window placeholder — same footprint, no canvas.
                        // R235: height từ aspect thật -> không nhảy khi page vào window.
                        <div
                          className='flex items-center justify-center bg-card/50 shadow-md'
                          style={{ width: pageWidth, height: heightForPage(pageNum) }}
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
    </div>
  );
}
