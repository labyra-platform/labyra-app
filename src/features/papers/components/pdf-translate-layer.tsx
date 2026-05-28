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

import { IconLoader2, IconX } from '@tabler/icons-react';
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

/** Collect text from text-layer spans intersecting `rect` (page-pixel space). */
function textInRect(layer: HTMLElement, rect: Rect): string {
  const box = layer.getBoundingClientRect();
  const spans = layer.querySelectorAll<HTMLElement>('.react-pdf__Page__textContent span, span');
  const parts: string[] = [];
  for (const span of spans) {
    const r = span.getBoundingClientRect();
    const sx = r.left - box.left;
    const sy = r.top - box.top;
    const cx = sx + r.width / 2;
    const cy = sy + r.height / 2;
    // Span counts if its center is inside the drag rectangle.
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      const txt = span.textContent ?? '';
      if (txt.trim()) parts.push(txt);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
  onTranslate
}: {
  width: number;
  height: number;
  active: boolean;
  /** Returns the translated text (throws on failure). */
  onTranslate: (text: string) => Promise<string>;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [box, setBox] = useState<ActiveBox | null>(null);

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
    if (!layer) return;
    const text = textInRect(layer, rect);
    if (!text) return;
    setBox({ rect, text, status: 'loading', translation: '' });
    try {
      const translation = await onTranslate(text);
      setBox({ rect, text, status: 'done', translation });
    } catch {
      setBox({ rect, text, status: 'error', translation: '' });
    }
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
            className='pointer-events-none absolute rounded-sm border border-dashed border-muted-foreground/50'
            style={{ left: box.rect.x, top: box.rect.y, width: box.rect.w, height: box.rect.h }}
          />
          <div
            className='absolute z-10 overflow-hidden rounded-md border bg-popover shadow-lg'
            style={{
              left: box.rect.x,
              top: box.rect.y + box.rect.h + 6,
              width: Math.max(box.rect.w, 220)
            }}
          >
            <div className='flex items-center justify-between border-b bg-muted/40 px-2 py-1'>
              <span className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                Translation
              </span>
              <button
                type='button'
                onClick={() => setBox(null)}
                className='rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground'
                aria-label='Close translation'
              >
                <IconX className='size-3.5' />
              </button>
            </div>
            <div className='max-h-64 overflow-y-auto px-3 py-2 text-sm leading-relaxed'>
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
