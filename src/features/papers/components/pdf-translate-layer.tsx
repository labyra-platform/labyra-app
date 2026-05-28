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
import { useRef, useState } from 'react';

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
  translation: string;
}

/** Collect text from text-layer spans intersecting `rect` (page-pixel space).
 *  `host` is the page wrapper that contains both the react-pdf .textLayer and
 *  this overlay; the overlay itself has no spans, so we search the wrapper.
 *
 *  Joining is geometric, not naive: PDF.js puts subscripts/superscripts (the
 *  "3" in IrCl₃) in their own spans placed flush against the preceding span. A
 *  blind join(' ') turns "IrCl₃" into "IrCl 3". So we only insert a space when
 *  there's a real horizontal gap between consecutive spans on the same line, and
 *  a newline when the line changes — formulae stay intact for the model. */
function textInRect(host: HTMLElement, overlayBox: DOMRect, rect: Rect): string {
  const spans = host.querySelectorAll<HTMLElement>('.textLayer span');
  const hits: { text: string; left: number; right: number; top: number; h: number }[] = [];
  for (const span of spans) {
    const r = span.getBoundingClientRect();
    const cx = r.left - overlayBox.left + r.width / 2;
    const cy = r.top - overlayBox.top + r.height / 2;
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      const text = span.textContent ?? '';
      if (text.length > 0) {
        hits.push({ text, left: r.left, right: r.right, top: r.top, h: r.height });
      }
    }
  }
  if (hits.length === 0) return '';
  // Reading order: top then left.
  hits.sort((a, b) => (Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left));

  let out = hits[0].text;
  for (let i = 1; i < hits.length; i++) {
    const prev = hits[i - 1];
    const cur = hits[i];
    const sameLine = Math.abs(cur.top - prev.top) <= Math.max(prev.h, cur.h) * 0.6;
    if (!sameLine) {
      out += '\n';
    } else {
      const gap = cur.left - prev.right;
      // Space only for a genuine word gap (~> a quarter of the line height).
      out += gap > prev.h * 0.25 ? ' ' : '';
    }
    out += cur.text;
  }
  // Collapse hyphenation at line breaks (e.g. "rea-\ngent" → "reagent") and
  // turn remaining newlines into spaces for a clean prose paragraph.
  return out
    .replace(/-\n/g, '')
    .replace(/\n/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Pointer position relative to the target element (px). */
function localPoint(e: React.PointerEvent): { x: number; y: number } {
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
}

export function PdfTranslateLayer({
  width,
  height,
  active,
  targetLabel,
  onTranslate
}: {
  width: number;
  height: number;
  active: boolean;
  /** Display label of the target language, shown in the panel header. */
  targetLabel: string;
  /** Returns the translated text (throws on failure). Calls onChunk with the
   *  growing partial as it streams in. */
  onTranslate: (text: string, onChunk?: (partial: string) => void) => Promise<string>;
}) {
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
    // Require Ctrl/Cmd held so normal reading clicks aren't hijacked.
    if (!active || !(e.ctrlKey || e.metaKey)) return;
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
    const text = textInRect(host, layer.getBoundingClientRect(), rect);
    if (!text) {
      setBox({ rect, text: '', status: 'error', translation: '' });
      return;
    }
    setPanelOffset({ dx: 0, dy: 0 });
    setBox({ rect, text, status: 'loading', translation: '' });
    try {
      const translation = await onTranslate(text, (partial) => {
        // Show text as it streams; flip to 'done' on first chunk so the panel
        // switches from the spinner to live text.
        setBox({ rect, text, status: 'done', translation: partial });
      });
      setBox({ rect, text, status: 'done', translation });
    } catch {
      setBox({ rect, text, status: 'error', translation: '' });
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
                      navigator.clipboard?.writeText(box.translation).catch(() => {});
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
              {box.status === 'done' && <p className='whitespace-pre-wrap'>{box.translation}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
