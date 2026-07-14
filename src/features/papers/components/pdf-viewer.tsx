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
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconDotsVertical,
  IconDownload,
  IconEraser,
  IconExternalLink,
  IconHighlight,
  IconLanguage,
  IconKeyboard,
  IconLoader2,
  IconMinus,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconChevronUp,
  IconX
} from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatSciNode } from '@/features/spectra/utils/format-units';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { getCachedPdf, setCachedPdf } from '@/features/papers/lib/pdf-cache';
import { PdfHighlightLayer } from '@/features/papers/components/pdf-highlight-layer';
import { citeMarkItem, countOccurrences, highlightItem } from '@/features/papers/lib/pdf-search';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdfDrawLayer } from '@/features/papers/components/pdf-draw-layer';
import { PdfTranslateLayer } from '@/features/papers/components/pdf-translate-layer';
import { usePaperTranslationsStore } from '@/features/papers/stores/paper-translations-store';
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
import { useReaderChromeStore } from '@/features/papers/stores/reader-chrome-store';
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
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
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

/** Target languages for in-reader translation (C5). */
const TRANSLATE_LANGS: readonly { code: string; label: string }[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' }
];

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
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
// R244: comfortable single-page reading width (px @ zoom 1). The page sheet is
// capped here and centred, so it stays a fixed size regardless of how wide the
// window is or whether the sidebar / side panel are open — toggling those only
// changes the margin around the sheet, never the sheet itself.
const READING_SHEET_MAX = 1100;

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
  active = true,
  jumpRequest
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
  /** R237am: external request to scroll to a specific page (e.g. from an Ask AI
   *  citation chip). Change the nonce to re-trigger even if the page is the
   *  same one the user is already on. R260: `highlight` is a short phrase from
   *  the cited chunk — when set, the matching text on that page is briefly
   *  flashed (`.pcm`) so the reader sees exactly what was cited. */
  jumpRequest?: { page: number; y?: number; highlight?: string; nonce: number };
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
  // R237z: editable page box. Local string state so the user can type freely;
  // commit on Enter/blur. Kept in sync when currentPage changes elsewhere.
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  // R237ab: avoid SSR/client hydration mismatch on nav buttons — `disabled`
  // depends on numPages which is 0 on the server and set after the PDF loads on
  // the client. Gate disabled state until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
  // R237ar: highlight mode toggle. When on, a text selection becomes a
  // highlight; when off, selecting text is normal copy (the overlay is
  // pointer-events:none so it never blocks selection regardless).
  const [highlightMode, setHighlightMode] = useState(false);
  // B2 (R237av): record finished translations for the side-panel list.
  const addTranslation = usePaperTranslationsStore((s) => s.add);
  // C4: freehand drawing. drawMode toggles pointer capture; while on, text
  // selection (highlight) is suppressed so the two tools don't fight.
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'eraser'>('pen');
  const [drawColor, setDrawColor] = useState<AnnotationColor>('pink');
  const [drawings, setDrawings] = useState<DrawingAnnotation[]>([]);
  // C4b: pen width as a fraction of page width, slider-controlled (R237ae).
  const [drawWidth, setDrawWidth] = useState(0.004); // ~2-3px at typical zoom
  // C5: translate mode + target language. Ctrl+drag a region while on.
  const [translateMode, setTranslateMode] = useState(false);
  const [targetLang, setTargetLang] = useState('vi');
  const [pdfReady, setPdfReady] = useState(false);

  // Ctrl+F in-document search (R237be). The text-item strings for each page are
  // pulled from pdf.js once (on first open) and cached; matches are computed
  // per item so the count equals the number of <mark> elements.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchMatches, setSearchMatches] = useState<{ page: number; occ: number }[]>([]);
  const [searchCurrent, setSearchCurrent] = useState(-1);
  const [searchIndexReady, setSearchIndexReady] = useState(false);
  const pageItemsRef = useRef<Map<number, string[]>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // R260: transient citation flash. Set from a jumpRequest carrying a phrase
  // from the cited chunk; the matching text on the jumped page is marked
  // (`.pcm`) for a few seconds, then cleared. Separate from Ctrl+F search.
  const [citeHighlight, setCiteHighlight] = useState<string | null>(null);
  const citeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  // R226b: gate reporting page/zoom to the store until the saved page has been
  // restored. Without this, when a tab re-mounts the freshly-loaded PDF briefly
  // sits at page 1, the IntersectionObserver reports 1, and that overwrites the
  // saved page in the store before we scroll to it — losing the reading position.
  const restoredRef = useRef(false);
  // R237aw: anchor (page + offset ratio) captured just before a layout-driven
  // width change (side panel / sidebar toggle), so we can restore the exact
  // reading position after the pages re-render at the new width. Without this,
  // the old scrollTop (px) points at the wrong page once page heights change.
  const scrollAnchorRef = useRef<{ page: number; ratio: number } | null>(null);
  const prevPageWidthRef = useRef<number>(0);

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

  // R244: page width is derived from the VIEWPORT (capped at a comfortable
  // reading width), NOT the PDF column. Toggling the sidebar or the side panel
  // changes the column width but not the viewport, so the page keeps its size
  // and is never re-rasterized on a panel toggle — it only gets more/less margin
  // around it. Width recomputes only on a real window resize (where page heights
  // DO change, so we restore the reading anchor captured just before).
  useLayoutEffect(() => {
    const captureAnchor = () => {
      const c = pagesContainerRef.current;
      if (!c || !restoredRef.current) return;
      const containerTop = c.getBoundingClientRect().top;
      const pages = c.querySelectorAll<HTMLElement>('[data-page-index]');
      for (const p of pages) {
        const r = p.getBoundingClientRect();
        if (r.bottom > containerTop + 1) {
          scrollAnchorRef.current = {
            page: Number(p.dataset.pageIndex),
            ratio: Math.max(0, Math.min(1, (containerTop - r.top) / (r.height || 1)))
          };
          return;
        }
      }
    };

    const measure = () => {
      const margin = isFullscreen ? 56 : 88;
      const w = Math.min(READING_SHEET_MAX + 32, Math.max(352, window.innerWidth - margin));
      setContainerWidth((prev) => {
        if (Math.abs(prev - w) <= 1) return prev;
        captureAnchor(); // remember reading position before the width changes
        return w;
      });
    };

    measure();
    const id = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measure);
    };
  }, [pdfReady, isFullscreen]);

  // R237aw: after pageWidth changes (e.g. side panel toggle re-flowed the
  // pages), restore the reading anchor captured just before the change.
  useLayoutEffect(() => {
    if (prevPageWidthRef.current === 0) {
      prevPageWidthRef.current = pageWidth;
      return;
    }
    if (prevPageWidthRef.current === pageWidth) return;
    prevPageWidthRef.current = pageWidth;
    const a = scrollAnchorRef.current;
    if (a && restoredRef.current) {
      requestAnimationFrame(() => scrollToPageAt(a.page, a.ratio));
    }
  });

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

  // R237af: client session cache — drag the same passage/figure again in this
  // session and the translation returns instantly (0ms, no network). Persists
  // for the viewer's lifetime; the Firestore cache in the route is durable.
  const translateCacheRef = useRef<Map<string, string>>(new Map());

  // Shared: POST a translate body, read the cached-JSON or streamed text-plain
  // response, push partials via onChunk, and cache the final under `cacheKey`.
  const runTranslate = useCallback(
    async (
      cacheKey: string,
      body: Record<string, unknown>,
      onChunk?: (partial: string) => void
    ): Promise<string> => {
      const hit = translateCacheRef.current.get(cacheKey);
      if (hit !== undefined) {
        onChunk?.(hit);
        return hit;
      }
      const { getFirebaseAuth } = await import('@/lib/firebase/client');
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();
      const res = await fetch(`/api/papers/${paperId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, targetLang })
      });
      if (!res.ok) throw new Error('translate_failed');

      // Cache hits return JSON; live translations stream as text/plain.
      if (res.headers.get('X-Translate-Stream') !== '1') {
        const data = (await res.json()) as { translation: string };
        translateCacheRef.current.set(cacheKey, data.translation);
        onChunk?.(data.translation);
        return data.translation;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('translate_failed');
      const decoder = new TextDecoder();
      let full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        onChunk?.(full);
      }
      // R501: flush any bytes the streaming decoder held back for an incomplete
      // multi-byte character (UTF-8 Vietnamese diacritics span 2–3 bytes); a
      // final decode() with no options emits them. Without this the last few
      // characters — the tail of the passage — silently vanish.
      full += decoder.decode();
      onChunk?.(full);
      full = full.trim();
      translateCacheRef.current.set(cacheKey, full);
      return full;
    },
    [paperId, targetLang]
  );

  const handleTranslateRegion = useCallback(
    async (
      payload: {
        text: string;
        image: string | null;
        regionHash: string;
        partialStart: boolean;
        partialEnd: boolean;
      },
      onChunk?: (partial: string) => void
    ): Promise<string> => {
      // Client session cache key combines the text content AND the region hash
      // so the same drag (or the same paragraph re-encountered) is instant.
      const cacheKey = `${targetLang}\u0000${payload.regionHash}\u0000${payload.text}`;
      return runTranslate(
        cacheKey,
        {
          text: payload.text || undefined,
          image: payload.image || undefined,
          imageHash: payload.image ? `${paperId}:${payload.regionHash}` : undefined,
          partialStart: payload.partialStart,
          partialEnd: payload.partialEnd
        },
        onChunk
      );
    },
    [runTranslate, targetLang, paperId]
  );

  // C4b: undo removes the most recently created drawing (by createdAt).
  const handleUndoDrawing = useCallback(() => {
    if (!tenantId || drawings.length === 0) return;
    const last = drawings.toSorted((a, b) => b.createdAt - a.createdAt)[0];
    if (last) deleteAnnotation(tenantId, paperId, last.id).catch(() => {});
  }, [tenantId, paperId, drawings]);

  // R237y: Ctrl/Cmd+Z undoes the last stroke while drawing (replaces the undo
  // button). Only active in draw mode so it doesn't hijack the shortcut.
  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, handleUndoDrawing]);

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
  // R237z: persist scroll position only AFTER scrolling settles (debounce), not
  // every frame. Writing the store on each rAF re-rendered subscribers mid-scroll
  // and made the scrollbar lag behind the wheel. The browser scrolls natively;
  // we just record the final offset ~160ms after the last scroll event.
  useEffect(() => {
    const el = pagesContainerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (restoredRef.current) onScrollChange?.(el.scrollTop);
      }, 160);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [onScrollChange, pdfReady]);

  // R468: auto-hide the toolbar + tabs by MOUSE POSITION, not scroll (scroll-up
  // reveal felt jittery). While the cursor sits in the reading area, collapse the
  // chrome after a 3 s dwell; move the cursor back into the top strip to reveal it.
  const setChromeCollapsed = useReaderChromeStore((s) => s.setCollapsed);
  const chromeCollapsed = useReaderChromeStore((s) => s.collapsed);
  useEffect(() => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const REVEAL_ZONE_PX = 64; // top strip that re-reveals the chrome
    const HIDE_DELAY_MS = 3000;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      if (e.clientY - rect.top < REVEAL_ZONE_PX) {
        clear();
        setChromeCollapsed(false);
      } else if (!hideTimer) {
        hideTimer = setTimeout(() => {
          setChromeCollapsed(true);
          hideTimer = null;
        }, HIDE_DELAY_MS);
      }
    };
    el.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      clear();
      el.removeEventListener('mousemove', onMove);
    };
  }, [setChromeCollapsed, pdfReady]);

  // Reset chrome to visible when the viewer mounts (new paper / fullscreen).
  useEffect(() => {
    setChromeCollapsed(false);
  }, [setChromeCollapsed]);

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

  // R237am: respond to runtime jump requests (e.g. an Ask AI citation chip).
  // Tracking the nonce — not just the page — means clicking the same chip twice
  // re-jumps (handy when the user has scrolled away between clicks).
  useEffect(() => {
    if (!jumpRequest) return;
    const { page, y, highlight } = jumpRequest;
    setCurrentPage(page);
    requestAnimationFrame(() => scrollToPageAt(page, y ?? null));
    if (!highlight) return;
    // R260: flash the cited phrase, then clear after a few seconds.
    setCiteHighlight(highlight);
    if (citeTimerRef.current) clearTimeout(citeTimerRef.current);
    citeTimerRef.current = setTimeout(() => setCiteHighlight(null), 4500);
    // The text layer paints the `.pcm` mark a frame or two after the page is in
    // view; poll briefly, then bring the cited line to the TOP of the viewport
    // (R261 — same top-landing math as TOC jumps, ~8px below the top) so the
    // reader lands right on it rather than hunting mid-page.
    let tries = 0;
    const alignToMark = () => {
      const root = pagesContainerRef.current;
      const pageEl = root?.querySelector<HTMLElement>(`[data-page-index="${page}"]`);
      const mark = pageEl?.querySelector<HTMLElement>('.pcm');
      if (pageEl && mark && pageEl.offsetHeight > 0) {
        const yRatio =
          (mark.getBoundingClientRect().top - pageEl.getBoundingClientRect().top) /
          pageEl.offsetHeight;
        scrollToPageAt(page, yRatio);
      } else if (tries++ < 12) {
        setTimeout(alignToMark, 70);
      }
    };
    setTimeout(alignToMark, 90);
  }, [jumpRequest, scrollToPageAt]);

  // R260: clear any pending citation-flash timer on unmount.
  useEffect(
    () => () => {
      if (citeTimerRef.current) clearTimeout(citeTimerRef.current);
    },
    []
  );

  // R237be: build the per-page text index once when search first opens.
  useEffect(() => {
    if (!searchOpen || searchIndexReady || !pdfProxy) return;
    let cancelled = false;
    (async () => {
      for (let p = 1; p <= pdfProxy.numPages; p++) {
        if (cancelled) return;
        if (pageItemsRef.current.has(p)) continue;
        try {
          const page = await pdfProxy.getPage(p);
          const content = await page.getTextContent();
          pageItemsRef.current.set(
            p,
            content.items.map((it) => it.str ?? '')
          );
        } catch {
          pageItemsRef.current.set(p, []);
        }
      }
      if (!cancelled) setSearchIndexReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchOpen, searchIndexReady, pdfProxy]);

  // Recompute matches whenever the query / case option / index changes.
  useEffect(() => {
    if (!searchOpen || !searchQuery) {
      setSearchMatches([]);
      setSearchCurrent(-1);
      return;
    }
    const res: { page: number; occ: number }[] = [];
    for (let p = 1; p <= numPages; p++) {
      const items = pageItemsRef.current.get(p);
      if (!items) continue;
      let occ = 0;
      for (const s of items) {
        const c = countOccurrences(s, searchQuery, searchCaseSensitive);
        for (let k = 0; k < c; k++) {
          res.push({ page: p, occ });
          occ++;
        }
      }
    }
    setSearchMatches(res);
    setSearchCurrent(res.length ? 0 : -1);
  }, [searchOpen, searchQuery, searchCaseSensitive, numPages, searchIndexReady]);

  // Scroll the active match into view + mark it. The text layer mounts a frame
  // or two after the page, so poll briefly for the <mark> before giving up.
  useEffect(() => {
    if (searchCurrent < 0) return;
    const match = searchMatches[searchCurrent];
    if (!match) return;
    setCurrentPage(match.page);
    const el = pagesContainerRef.current;
    if (!el) return;
    let tries = 0;
    let raf = 0;
    const tick = () => {
      const pageEl = el.querySelector<HTMLElement>(`[data-page-index="${match.page}"]`);
      const marks = pageEl?.querySelectorAll<HTMLElement>('.psm');
      el.querySelectorAll<HTMLElement>('.psm-current').forEach((m) =>
        m.classList.remove('psm-current')
      );
      const mark = marks?.[match.occ];
      if (mark) {
        mark.classList.add('psm-current');
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (tries++ < 30) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [searchCurrent, searchMatches]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setSearchCurrent(-1);
  }, []);
  const gotoNextMatch = useCallback(() => {
    setSearchCurrent((i) => (searchMatches.length ? (i + 1) % searchMatches.length : -1));
  }, [searchMatches.length]);
  const gotoPrevMatch = useCallback(() => {
    setSearchCurrent((i) =>
      searchMatches.length ? (i - 1 + searchMatches.length) % searchMatches.length : -1
    );
  }, [searchMatches.length]);

  // customTextRenderer for <Page>: highlight matches in the text layer. Memoized
  // so the text layer only re-renders when the query / case option changes.
  // R260: while a citation flash is active it takes precedence (its own `.pcm`
  // class); otherwise the Ctrl+F search marks (`.psm`) render as before.
  const renderSearchText = useCallback(
    (item: { str: string }) =>
      citeHighlight
        ? citeMarkItem(item.str, citeHighlight)
        : highlightItem(item.str, searchQuery, searchCaseSensitive),
    [citeHighlight, searchQuery, searchCaseSensitive]
  );

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

  // Reflect the live page into the editable box (scroll, prev/next, TOC jumps).
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Commit a typed page number: clamp to [1, numPages], jump, or revert if NaN.
  const commitPageInput = useCallback(() => {
    const n = Number.parseInt(pageInput, 10);
    if (Number.isNaN(n)) {
      setPageInput(String(currentPage));
      return;
    }
    const target = Math.max(1, Math.min(numPages || 1, n));
    setCurrentPage(target);
    scrollToPage(target);
    setPageInput(String(target));
  }, [pageInput, currentPage, numPages, scrollToPage]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);
  const setZoomTo = (z: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +z.toFixed(2))));
  // Fit the current page's full height into the scroll container. (Fit-width is
  // just 100%, since pageWidth at zoom=1 already fills the available width.)
  const fitPage = () => {
    const el = pagesContainerRef.current;
    if (!el) return;
    const available = Math.max(320, containerWidth - 32);
    const aspect = aspectFor(currentPage) || Math.SQRT2;
    const targetH = el.clientHeight - 48;
    if (targetH > 0) setZoomTo(targetH / (available * aspect));
  };
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
      // Ctrl/⌘+F opens the find bar from anywhere (before the input guard).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
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
        'relative flex flex-col bg-muted/20 w-full min-w-0 max-w-full overflow-hidden',
        isFullscreen ? 'h-screen' : embedded ? 'h-full' : 'h-[calc(100vh-4rem)]'
      )}
    >
      {/* R402: thin hover strip — reveal the chrome without scrolling up. */}
      <div
        className='absolute inset-x-0 top-0 z-20 h-2'
        onMouseEnter={() => setChromeCollapsed(false)}
      />
      {/* Toolbar (auto-hides while reading) */}
      <header
        onMouseEnter={() => setChromeCollapsed(false)}
        className={cn(
          'flex items-center gap-1.5 overflow-hidden border-b bg-background px-3 transition-all duration-200 sm:gap-2 sm:px-4',
          chromeCollapsed ? 'max-h-0 border-b-0 py-0 opacity-0' : 'max-h-16 py-2 opacity-100'
        )}
      >
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
            {paperLoading ? t('loading') : formatSciNode(displayTitle)}
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

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
        {/* Page nav */}
        <div className='hidden items-center gap-1 sm:flex'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={goPrev}
            disabled={mounted && currentPage <= 1}
            aria-label={t('prevPage')}
            title={`${t('prevPage')} (←)`}
          >
            <IconChevronLeft className='size-4' />
          </Button>
          <div className='flex items-center gap-1 text-xs text-muted-foreground'>
            <input
              type='text'
              inputMode='numeric'
              value={mounted ? pageInput : '1'}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={(e) => e.target.select()}
              onBlur={commitPageInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitPageInput();
                  e.currentTarget.blur();
                }
              }}
              className='w-10 rounded border bg-background px-1 py-0.5 text-center tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
              aria-label={t('currentPage')}
            />
            <span>/ {numPages || '—'}</span>
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={goNext}
            disabled={mounted && currentPage >= numPages}
            aria-label={t('nextPage')}
            title={`${t('nextPage')} (→)`}
          >
            <IconChevronRight className='size-4' />
          </Button>
        </div>

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
        {/* Zoom */}
        <div className='flex items-center gap-0.5'>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={zoomOut}
            disabled={mounted && zoom <= ZOOM_MIN}
            aria-label={t('zoomOut')}
            title={`${t('zoomOut')} (Ctrl −)`}
          >
            <IconMinus className='size-4' />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded px-1.5 py-1 text-xs tabular-nums hover:bg-muted'
                title={t('zoomLevel')}
              >
                {Math.round((mounted ? zoom : 1) * 100)}%
                <IconChevronDown className='size-3 opacity-60' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='center' className='min-w-[9rem]'>
              {ZOOM_PRESETS.map((p) => {
                const isActive = mounted && Math.round(zoom * 100) === Math.round(p * 100);
                return (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => setZoomTo(p)}
                    className='justify-between'
                  >
                    {Math.round(p * 100)}%{isActive && <IconCheck className='size-3.5' />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={fitPage}>{t('fitPage')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            onClick={zoomIn}
            disabled={mounted && zoom >= ZOOM_MAX}
            aria-label={t('zoomIn')}
            title={`${t('zoomIn')} (Ctrl +)`}
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

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
        {/* Search (R237be) — toggle the in-document find bar (Ctrl/⌘+F). */}
        <Button
          variant={searchOpen ? 'secondary' : 'ghost'}
          size='icon'
          className='size-7 shrink-0'
          onClick={() => {
            setSearchOpen((o) => !o);
            requestAnimationFrame(() => searchInputRef.current?.focus());
          }}
          aria-pressed={searchOpen}
          aria-label={t('searchInDoc')}
          title={`${t('searchInDoc')} (Ctrl F)`}
        >
          <IconSearch className='size-4' />
        </Button>

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
        {/* Highlight (C3b / R237ar) — toggle: when on, selecting text marks it.
            Turns off draw/translate so the tools don't fight. Rotation 0 only. */}
        <Button
          variant={highlightMode ? 'secondary' : 'ghost'}
          size='icon'
          className='size-7'
          disabled={rotation !== 0}
          onClick={() => {
            setHighlightMode((v) => {
              const next = !v;
              if (next) {
                setDrawMode(false);
                setTranslateMode(false);
              }
              return next;
            });
          }}
          aria-pressed={highlightMode}
          aria-label={t('highlight')}
          title={t('highlight')}
        >
          <IconHighlight className='size-4' />
        </Button>

        {/* Draw (C4) — one button: toggles draw mode AND is the pen tool, with a
            hover color palette + a top color indicator. Only at rotation 0. */}
        <div className='group relative'>
          <Button
            variant={drawMode && drawTool === 'pen' ? 'secondary' : 'ghost'}
            size='icon'
            className='relative size-7 overflow-hidden'
            disabled={rotation !== 0}
            onClick={() => {
              if (!drawMode) {
                setDrawMode(true);
                setDrawTool('pen');
                setHighlightMode(false);
              } else if (drawTool !== 'pen') {
                setDrawTool('pen');
              } else {
                setDrawMode(false);
              }
            }}
            aria-pressed={drawMode}
            aria-label={t('draw')}
            title={t('draw')}
          >
            <IconPencil className='size-4' />
            {drawMode && (
              <span
                className='absolute inset-x-1 top-0 h-[3px] rounded-b-sm'
                style={{ backgroundColor: DRAW_SWATCH[drawColor] }}
                aria-hidden
              />
            )}
          </Button>
          {/* Palette (only when drawing): colors + width. Popover + stack
              Slider, opened from a small caret so the pen button itself stays
              a quick pen/eraser toggle. */}
          {drawMode && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  aria-label={t('drawWidth')}
                  title={t('drawWidth')}
                >
                  <IconChevronDown className='size-3.5' />
                </Button>
              </PopoverTrigger>
              <PopoverContent align='center' className='w-auto p-3'>
                <div className='flex flex-col gap-3'>
                  <div className='flex items-center gap-1.5'>
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
                  <div className='flex items-center gap-2'>
                    <span
                      className='shrink-0 rounded-full'
                      style={{
                        width: Math.max(3, drawWidth * 700),
                        height: Math.max(3, drawWidth * 700),
                        backgroundColor: DRAW_SWATCH[drawColor]
                      }}
                      aria-hidden
                    />
                    <Slider
                      min={0.0015}
                      max={0.012}
                      step={0.0005}
                      value={[drawWidth]}
                      onValueChange={(v) => {
                        setDrawWidth(v[0] ?? 0.003);
                        setDrawTool('pen');
                      }}
                      className='w-28'
                      aria-label={t('drawWidth')}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {drawMode && (
          <div className='flex items-center gap-1'>
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
          </div>
        )}

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
        {/* Translate (C5) — pick target language via a proper DropdownMenu;
            active = right-drag a region to translate. Only at rotation 0. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={translateMode ? 'secondary' : 'ghost'}
              size='icon'
              className='relative size-7 overflow-hidden'
              disabled={rotation !== 0}
              aria-label={t('translate')}
              title={t('translate')}
            >
              <IconLanguage className='size-4' />
              {translateMode && (
                <span
                  className='absolute inset-x-1 bottom-0 truncate text-center text-[8px] font-semibold uppercase leading-none text-primary'
                  aria-hidden
                >
                  {targetLang}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='center' className='min-w-[8rem]'>
            <DropdownMenuLabel>{t('translate')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={targetLang}
              onValueChange={(code) => {
                setTargetLang(code);
                setTranslateMode(true);
                setHighlightMode(false);
              }}
            >
              {TRANSLATE_LANGS.map((l) => (
                <DropdownMenuRadioItem key={l.code} value={l.code}>
                  {l.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {translateMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTranslateMode(false)}>
                  {t('translateOff')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className='mx-0.5 hidden h-5 w-px shrink-0 bg-border sm:block' aria-hidden />
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

        {/* View actions kebab (R237bd) — groups download + open-in-new-tab so
            the toolbar's right edge is one overflow button, not a row of icons. */}
        {(signed?.url || fileSource) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='size-7 shrink-0'
                aria-label={t('moreActions')}
                title={t('moreActions')}
              >
                <IconDotsVertical className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <a
                  href={signed?.url ?? fileSource ?? '#'}
                  download={`${displayTitle || 'paper'}.pdf`}
                  rel='noopener noreferrer'
                >
                  <IconDownload className='size-4' />
                  {t('download')}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={signed?.url ?? fileSource ?? '#'}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <IconExternalLink className='size-4' />
                  {t('openInNewTab')}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
                <IconKeyboard className='size-4' />
                {t('shortcutsTitle')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Find bar (R237be) — slides in under the toolbar on Ctrl+F or the search
          button. Highlights all matches in the text layer; ↑/↓ + Enter cycle. */}
      {searchOpen && (
        <div className='flex justify-end border-b px-3 py-1.5'>
          <div className='flex w-full max-w-md items-center gap-1.5 rounded-lg border bg-background px-2 py-1 shadow-sm'>
            <IconSearch className='size-4 shrink-0 text-muted-foreground' />
            <input
              ref={searchInputRef}
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) gotoPrevMatch();
                  else gotoNextMatch();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
              placeholder={t('searchPlaceholder')}
              className='min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground'
              aria-label={t('searchInDoc')}
            />
            <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>
              {searchQuery
                ? searchMatches.length
                  ? t('searchMatch', { current: searchCurrent + 1, total: searchMatches.length })
                  : searchIndexReady
                    ? t('searchNoMatch')
                    : '…'
                : ''}
            </span>
            <button
              type='button'
              onClick={() => setSearchCaseSensitive((v) => !v)}
              aria-pressed={searchCaseSensitive}
              title={t('searchCaseSensitive')}
              className={cn(
                'shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium transition-colors',
                searchCaseSensitive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              Aa
            </button>
            <div className='mx-0.5 h-4 w-px bg-border' aria-hidden />
            <button
              type='button'
              onClick={gotoPrevMatch}
              disabled={searchMatches.length === 0}
              aria-label={t('searchPrev')}
              title={`${t('searchPrev')} (Shift ↵)`}
              className='flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'
            >
              <IconChevronUp className='size-4' />
            </button>
            <button
              type='button'
              onClick={gotoNextMatch}
              disabled={searchMatches.length === 0}
              aria-label={t('searchNext')}
              title={`${t('searchNext')} (↵)`}
              className='flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'
            >
              <IconChevronDown className='size-4' />
            </button>
            <button
              type='button'
              onClick={closeSearch}
              aria-label={t('close')}
              title={`${t('close')} (Esc)`}
              className='flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            >
              <IconX className='size-4' />
            </button>
          </div>
        </div>
      )}

      {/* Search highlight styling for the pdf.js text layer (R237be). The text
          layer's glyphs are transparent and sit exactly over the canvas; <mark>'s
          UA style forces black text, which doubled the glyphs — so force the
          mark text transparent too and only paint the background. */}
      <style>{`.psm{color:transparent !important;background:rgba(250,204,21,.45);border-radius:1px}.psm-current{color:transparent !important;background:rgba(249,115,22,.7);box-shadow:0 0 0 1px rgba(249,115,22,.85)}`}</style>

      {/* Keyboard shortcuts (R237bg) — opened with ? or from the view kebab. */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>{t('shortcutsTitle')}</DialogTitle>
          </DialogHeader>
          <div className='divide-y text-sm'>
            {[
              { keys: ['←', '→'], label: t('shortcutPage') },
              { keys: ['Ctrl', '+ / −'], label: t('shortcutZoom') },
              { keys: ['Ctrl', '0'], label: t('shortcutReset') },
              { keys: ['Ctrl', 'F'], label: t('searchInDoc') },
              { keys: ['Ctrl', 'Z'], label: t('shortcutUndo') },
              { keys: ['Esc'], label: t('shortcutClose') }
            ].map((row) => (
              <div key={row.label} className='flex items-center justify-between gap-3 py-2'>
                <span className='text-muted-foreground'>{row.label}</span>
                <span className='flex shrink-0 items-center gap-1'>
                  {row.keys.map((k) => (
                    <kbd
                      key={k}
                      className='rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground'
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
                            customTextRenderer={
                              searchQuery || citeHighlight ? renderSearchText : undefined
                            }
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
                          {/* C3b: highlight overlay. Always rendered (rotation
                              0) so saved marks show; it only captures a
                              selection when highlightMode is on. The overlay is
                              pointer-events:none, so it never blocks text
                              selection / draw / translate underneath. */}
                          {rotation === 0 && pageAspects[pageNum] && (
                            <PdfHighlightLayer
                              pageNumber={pageNum}
                              width={pageWidth}
                              height={pageWidth * pageAspects[pageNum]}
                              highlights={highlights}
                              enabled={highlightMode && !drawMode && !translateMode}
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
                              active={drawMode && !translateMode}
                              tool={drawTool}
                              color={drawColor}
                              penWidth={drawWidth}
                              onCreateStroke={(points, w, c) =>
                                handleCreateStroke(points, w, c, pageNum)
                              }
                              onEraseStroke={handleDeleteDrawing}
                            />
                          )}
                          {/* C5: translate overlay — Ctrl+drag a region while on. */}
                          {rotation === 0 && translateMode && pageAspects[pageNum] && (
                            <PdfTranslateLayer
                              width={pageWidth}
                              height={pageWidth * pageAspects[pageNum]}
                              pageNumber={pageNum}
                              active={translateMode}
                              targetLabel={
                                TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ??
                                targetLang
                              }
                              onTranslateRegion={handleTranslateRegion}
                              onTranslated={(rec) => addTranslation(paperId, rec)}
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
