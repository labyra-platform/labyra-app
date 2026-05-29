'use client';

/**
 * PdfTranslateLayer (C5) — per-page overlay for region translation.
 *
 * Flow: with translate mode on, the user Ctrl+drags a rectangle over a passage.
 * On release we collect the text of the PDF text-layer spans that fall inside
 * the rectangle, send it to /api/papers/[id]/translate, and show the result in
 * a panel placed directly beneath the selected region — same width as the drag,
 * with the original region kept as a dashed outline above it (two stacked boxes).
 *
 * Geometry while live is in page pixels (the box only needs to last for this
 * view); nothing is persisted, so no normalization is required here.
 */

import { IconCheck, IconCopy, IconGripVertical, IconLoader2, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { copyPapersRich } from '@/features/papers/lib/copy-rich';
import { sanitizeFormatting } from '@/features/papers/lib/sanitize-formatting';
import { cn } from '@/lib/utils';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ActiveBox {
  rect: Rect;
  text: string;
  status: 'loading' | 'done' | 'error';
  /** Clean translation — NO ellipsis. Partial markers are rendered separately
   *  (R237aw) so copying never picks up a stray "…". */
  translation: string;
  partialStart: boolean;
  partialEnd: boolean;
}

/** True if a text-layer span is rotated (e.g. the vertical "Downloaded via…"
 *  string printed down a journal's left margin). getComputedStyle resolves any
 *  rotate()/matrix() to matrix form; horizontal text is scaleX only (angle ≈ 0). */
function isRotatedSpan(transform: string): boolean {
  if (!transform || transform === 'none') return false;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (m) {
    const [a, b] = m[1].split(',').map(Number);
    const angle = (Math.atan2(b ?? 0, a ?? 1) * 180) / Math.PI;
    return Math.abs(angle) > 25;
  }
  const r = transform.match(/rotate\(([-\d.]+)deg\)/);
  return r ? Math.abs(Number.parseFloat(r[1])) > 25 : false;
}

// Fraction of page height treated as header / footer margin. Items whose centre
// falls in the top HEADER_BAND or bottom FOOTER_BAND of the page are dropped
// from region translation — they're journal furniture (logo, running head,
// page number, DOI, copyright), not body text. Bands are small so a box drawn
// over real content (incl. the title at ~12–18%) is never affected.
const HEADER_BAND = 0.07;
const FOOTER_BAND = 0.93;

/** Collect text from text-layer spans intersecting `rect` (page-pixel space).
 *  `host` is the page wrapper that contains both the react-pdf .textLayer and
 *  this overlay; the overlay itself has no spans, so we search the wrapper.
 *
 *  Joining is geometric, not naive: PDF.js puts subscripts/superscripts (the
 *  "3" in IrCl₃) in their own spans placed flush against the preceding span. A
 *  blind join(' ') turns "IrCl₃" into "IrCl 3". So we only insert a space when
 *  there's a real horizontal gap between consecutive spans on the same line, and
 *  a newline when the line changes — formulae stay intact for the model.
 *
 *  Non-body furniture is filtered out (R237bf): rotated margin text, and items
 *  in the header/footer bands — so dragging a wide box doesn't pull the journal
 *  name, page number or DOI into the translation. */
function textInRect(host: HTMLElement, overlayBox: DOMRect, rect: Rect): string {
  const spans = host.querySelectorAll<HTMLElement>('.textLayer span');
  const pageH = overlayBox.height;
  const hits: { text: string; left: number; right: number; top: number; h: number }[] = [];
  for (const span of spans) {
    const r = span.getBoundingClientRect();
    const cx = r.left - overlayBox.left + r.width / 2;
    const cy = r.top - overlayBox.top + r.height / 2;
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      // Drop rotated (vertical-margin) text.
      if (isRotatedSpan(getComputedStyle(span).transform)) continue;
      // Drop header / footer furniture by vertical position on the page.
      if (pageH > 0) {
        const yFrac = cy / pageH;
        if (yFrac < HEADER_BAND || yFrac > FOOTER_BAND) continue;
      }
      const text = span.textContent ?? '';
      if (text.length > 0) {
        hits.push({ text, left: r.left, right: r.right, top: r.top, h: r.height });
      }
    }
  }
  if (hits.length === 0) return '';
  hits.sort((a, b) => (Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left));

  let out = hits[0].text;
  for (let i = 1; i < hits.length; i++) {
    const prev = hits[i - 1];
    const cur = hits[i];
    const verticalGap = cur.top - prev.top;
    const lineH = Math.max(prev.h, cur.h);
    const sameLine = Math.abs(verticalGap) <= lineH * 0.6;
    if (!sameLine) {
      // A jump larger than ~1.6× line height looks like a paragraph break.
      // 0.6× < gap < 1.6× = a normal soft line wrap.
      out += verticalGap > lineH * 1.6 ? '\n\n' : '\n';
    } else {
      const gap = cur.left - prev.right;
      out += gap > prev.h * 0.25 ? ' ' : '';
    }
    out += cur.text;
  }
  // De-hyphenate soft line wraps ("rea-\ngent" → "reagent"); collapse single
  // newlines (line wraps) to spaces but KEEP \n\n (paragraph breaks); also
  // preserve bullet markers at line start (• ● - 1. (a)).
  return out
    .replace(/-\n(?!\n)/g, '')
    .replace(/(?<!\n)\n(?!\n)/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n\n */g, '\n\n')
    .trim();
}

/** Pointer position relative to the target element (px). */
function localPoint(e: React.PointerEvent): { x: number; y: number } {
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}

/** Render the model output safely.
 *
 *  Pipeline:
 *  (1) Extract every <math>…</math> block, render its LaTeX with KaTeX (trust:
 *      false → output is safe, no \input/\href escape hatches). Replace each
 *      block with a placeholder.
 *  (2) HTML-escape what remains (defang any other tags/scripts/attributes).
 *  (3) Re-enable the whitelisted formatting tags <sub>/<sup>/<b>/<i> by
 *      un-escaping their angle brackets.
 *  (4) Swap placeholders for the KaTeX-rendered HTML.
 *
 *  Order matters: we trust KaTeX's own HTML but nothing else from the model. */
/** Heuristic: does this content actually look like LaTeX math? KaTeX warns
 *  loudly when given Vietnamese prose; we only invoke it when there's a real
 *  math signal. */
/** Crop the page's rendered canvas to `rect` (overlay-pixel space) and return a
 *  PNG data string (base64, no prefix) + a blankness flag. Returns null if no
 *  canvas is found. Blank detection uses luma standard deviation: a near-uniform
 *  crop (empty margin, solid fill) is "blank" and not worth sending to vision. */
function cropCanvasRegion(
  host: HTMLElement,
  overlayBox: DOMRect,
  rect: Rect
): { base64: string; blank: boolean } | null {
  const pageCanvas = host.querySelector<HTMLCanvasElement>('canvas');
  if (!pageCanvas) return null;
  const scaleX = pageCanvas.width / overlayBox.width;
  const scaleY = pageCanvas.height / overlayBox.height;
  const sx = Math.max(0, Math.round(rect.x * scaleX));
  const sy = Math.max(0, Math.round(rect.y * scaleY));
  const sw = Math.min(pageCanvas.width - sx, Math.round(rect.w * scaleX));
  const sh = Math.min(pageCanvas.height - sy, Math.round(rect.h * scaleY));
  if (sw < 4 || sh < 4) return null;

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Blankness via luma stddev on a downsampled read.
  let blank = true;
  try {
    const data = ctx.getImageData(0, 0, sw, sh).data;
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 16) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += luma;
      sumSq += luma * luma;
      n++;
    }
    if (n > 0) {
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      blank = Math.sqrt(Math.max(0, variance)) < 6; // near-uniform → blank
    }
  } catch {
    blank = false; // tainted canvas etc. — let the server decide
  }

  const base64 = out.toDataURL('image/png').split(',')[1] ?? '';
  return { base64, blank };
}

export function PdfTranslateLayer({
  width,
  height,
  pageNumber,
  active,
  targetLabel,
  onTranslateRegion,
  onTranslated
}: {
  width: number;
  height: number;
  pageNumber: number;
  active: boolean;
  targetLabel: string;
  /** One-shot: send any combination of text + cropped image, with a stable
   *  region hash for caching. Server picks mode (text/image/dual). */
  onTranslateRegion: (
    payload: {
      text: string;
      image: string | null;
      regionHash: string;
      partialStart: boolean;
      partialEnd: boolean;
    },
    onChunk?: (partial: string) => void
  ) => Promise<string>;
  /** B2 (R237av): fired when a region finishes translating, so the host can add
   *  it to the side-panel "Translations" list. */
  onTranslated?: (rec: {
    page: number;
    source: string;
    translation: string;
    partialStart: boolean;
    partialEnd: boolean;
    yRatio: number;
  }) => void;
}) {
  const t = useTranslations('papers');
  const layerRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [box, setBox] = useState<ActiveBox | null>(null);
  const [copied, setCopied] = useState(false);
  // R237ae: the result panel can be dragged anywhere (to avoid covering text).
  // Offset is relative to its default position just below the selected region.
  const [panelOffset, setPanelOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const panelDragRef = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Right mouse button (button 2) starts a selection — left clicks/scrolling
    // stay free for normal reading. Touch (pointerType 'touch') also allowed.
    if (!active) return;
    const isRight = e.button === 2 || e.pointerType === 'touch';
    if (!isRight) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = localPoint(e);
    startRef.current = p;
    setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
    setBox(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const p = localPoint(e);
    const s = startRef.current;
    setDragRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y)
    });
  };

  const onPointerUp = async () => {
    const rect = dragRect;
    startRef.current = null;
    setDragRect(null);
    if (!rect || rect.w < 12 || rect.h < 8) return;
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    const rawText = textInRect(host, layer.getBoundingClientRect(), rect);
    setPanelOffset({ dx: 0, dy: 0 });

    // Detect a selection that starts or ends mid-sentence so we can show a "…"
    // and tell the model to translate the fragment as-is (not complete it).
    //   - partialStart: first non-space char is lowercase / not a sentence start.
    //   - partialEnd: last char isn't sentence-final punctuation.
    const partialStart = /^[\p{Ll}]/u.test(rawText) || /^[,;:)\]]/.test(rawText);
    const partialEnd = rawText.length > 0 && !/[.!?:”"'）)\]]\s*$/.test(rawText);
    const text = rawText;

    // Crop the page canvas for the region. We send the image alongside the text
    // (dual mode) so the model can recover equations / sub-superscripts the PDF
    // text layer mangled. Pure-figure regions (no text) become image-only mode.
    const crop = cropCanvasRegion(host, layer.getBoundingClientRect(), rect);
    if (!text && (!crop || crop.blank || !crop.base64)) {
      // No text AND no usable image (blank region) → nothing to translate.
      setBox({
        rect,
        text: '',
        status: 'error',
        translation: '',
        partialStart: false,
        partialEnd: false
      });
      return;
    }
    const regionHash = `${pageNumber}:${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(
      rect.w
    )}:${Math.round(rect.h)}`;
    const image = crop && !crop.blank ? crop.base64 : null;

    setBox({ rect, text, status: 'loading', translation: '', partialStart, partialEnd });
    try {
      const translation = await onTranslateRegion(
        { text, image, regionHash, partialStart, partialEnd },
        (partial) => {
          setBox({ rect, text, status: 'done', translation: partial, partialStart, partialEnd });
        }
      );
      if (!translation || translation === '[NO_TEXT]') {
        setBox({ rect, text, status: 'error', translation: '', partialStart, partialEnd });
      } else {
        setBox({ rect, text, status: 'done', translation, partialStart, partialEnd });
        // B2: surface the finished translation to the side-panel list. yRatio is
        // the region's vertical position in the page, for scroll-to-region.
        if (text.trim() && layerRef.current) {
          const h = layerRef.current.getBoundingClientRect().height || height;
          onTranslated?.({
            page: pageNumber,
            source: text,
            translation,
            partialStart,
            partialEnd,
            yRatio: Math.max(0, Math.min(1, rect.y / h))
          });
        }
      }
    } catch {
      setBox({ rect, text, status: 'error', translation: '', partialStart, partialEnd });
    }
  };

  // Panel drag (via its header bar).
  const onPanelHeaderDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panelDragRef.current = {
      px: e.clientX,
      py: e.clientY,
      dx: panelOffset.dx,
      dy: panelOffset.dy
    };
  };
  const onPanelHeaderMove = (e: React.PointerEvent) => {
    const d = panelDragRef.current;
    if (!d) return;
    e.stopPropagation();
    setPanelOffset({ dx: d.dx + (e.clientX - d.px), dy: d.dy + (e.clientY - d.py) });
  };
  const onPanelHeaderUp = (e: React.PointerEvent) => {
    panelDragRef.current = null;
    e.stopPropagation();
  };

  return (
    <div
      ref={layerRef}
      className='absolute inset-0'
      style={{
        width,
        height,
        zIndex: active ? 30 : 1,
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : 'default'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      // a11y: this is a drawing-style capture surface, not a control.
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
      role='presentation'
    >
      {/* Live drag rectangle */}
      {dragRect && (
        <div
          className='pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/5'
          style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
        />
      )}

      {/* Result: original region (dashed) + translation panel below it */}
      {box && (
        <>
          <div
            className='pointer-events-none absolute rounded-sm border-2 border-dashed border-primary/60'
            style={{ left: box.rect.x, top: box.rect.y, width: box.rect.w, height: box.rect.h }}
          />
          <div
            className='absolute z-10 overflow-hidden rounded-md border-2 border-primary/70 bg-popover shadow-xl ring-1 ring-black/5'
            style={{
              left: box.rect.x + panelOffset.dx,
              top: box.rect.y + box.rect.h + 6 + panelOffset.dy,
              width: Math.max(box.rect.w, 220)
            }}
          >
            <div
              className='flex cursor-move touch-none items-center justify-between border-b-2 border-primary/30 bg-primary/10 px-2 py-1 select-none'
              onPointerDown={onPanelHeaderDown}
              onPointerMove={onPanelHeaderMove}
              onPointerUp={onPanelHeaderUp}
              // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
              role='presentation'
            >
              <span className='flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary'>
                <IconGripVertical className='size-3.5 opacity-70' />
                {targetLabel}
              </span>
              <div className='flex items-center gap-0.5'>
                {box.status === 'done' && box.translation && (
                  <button
                    type='button'
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      void copyPapersRich(box.translation);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1200);
                    }}
                    className='rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground'
                    aria-label='Copy translation'
                  >
                    {copied ? (
                      <IconCheck className='size-3.5 text-primary' />
                    ) : (
                      <IconCopy className='size-3.5' />
                    )}
                  </button>
                )}
                <button
                  type='button'
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setBox(null)}
                  className='rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground'
                  aria-label='Close translation'
                >
                  <IconX className='size-3.5' />
                </button>
              </div>
            </div>
            <div className='max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-foreground'>
              {box.status === 'loading' && (
                <span className='flex items-center gap-2 text-muted-foreground'>
                  <IconLoader2 className='size-4 animate-spin' />
                  Translating…
                </span>
              )}
              {box.status === 'error' && (
                <span className='text-destructive'>Translation failed. Try again.</span>
              )}
              {box.status === 'done' && (
                <div
                  className={cn(
                    'whitespace-pre-wrap',
                    '[&_sub]:align-sub [&_sub]:text-[0.65em]',
                    '[&_sup]:align-super [&_sup]:text-[0.65em]',
                    '[&_b]:font-semibold [&_b]:text-foreground',
                    '[&_i]:italic',
                    // KaTeX brings its own typography for .katex; we just give
                    // it room to breathe inside our prose flow.
                    '[&_.katex]:mx-0.5 [&_.katex]:text-[1em]'
                  )}
                >
                  {box.partialStart && (
                    <span
                      className='mr-0.5 select-none text-muted-foreground/45'
                      title={t('partialNote')}
                    >
                      …
                    </span>
                  )}
                  {/* Safe: <math> blocks are pre-rendered by KaTeX
                      (trust:false, no \href/\input); the rest is HTML-escaped and
                      only sub/sup/b/i tags are re-enabled with no attributes. */}
                  <span dangerouslySetInnerHTML={{ __html: sanitizeFormatting(box.translation) }} />
                  {box.partialEnd && (
                    <span
                      className='ml-0.5 select-none text-muted-foreground/45'
                      title={t('partialNote')}
                    >
                      …
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
