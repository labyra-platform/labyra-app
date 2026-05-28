'use client';

/**
 * PdfHighlightLayer (C3b) — per-page overlay that (a) renders saved highlights
 * and (b) turns a text selection into a new highlight.
 *
 * Coordinates: highlights are stored NORMALIZED (0..1 of the page box, see
 * C3a schema). This layer is an absolutely-positioned box that exactly covers
 * the rendered page, so a normalized rect maps to pixels by simple multiply
 * (x*width, y*height, ...). That makes highlights survive zoom and window
 * resize for free — the layer just re-multiplies by the new page size.
 *
 * Scope (C3b): rotation must be 0 for creating/showing highlights. At 90/270
 * the selection→normalized math needs an axis swap we defer to a later round;
 * the parent hides this layer when rotated, so marks never render misplaced.
 */

import { IconTrash } from '@tabler/icons-react';
import { useCallback, useRef, useState } from 'react';
import type { AnnotationColor, HighlightAnnotation, NormRect } from '@/types/annotations';
import { ANNOTATION_COLORS, HIGHLIGHT_FILL } from '@/types/annotations';
import { cn } from '@/lib/utils';

interface PendingSelection {
  rects: NormRect[];
  text: string;
  /** Anchor for the color popup, relative to the layer (px). */
  anchorX: number;
  anchorY: number;
}

const COLOR_SWATCH: Record<AnnotationColor, string> = {
  yellow: '#FFD600',
  green: '#00C853',
  blue: '#2979FF',
  pink: '#F50057',
  orange: '#FF6D00'
};

export function PdfHighlightLayer({
  pageNumber,
  width,
  height,
  highlights,
  onCreate,
  onDelete
}: {
  pageNumber: number;
  width: number;
  height: number;
  highlights: HighlightAnnotation[];
  onCreate: (rects: NormRect[], text: string, color: AnnotationColor) => void;
  onDelete: (id: string) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // On mouseup, read the selection and convert its client rects into normalized
  // rects relative to THIS page's layer box. Ignore selections outside the page.
  const handleMouseUp = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setPending(null);
      return;
    }
    const box = layer.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects());
    const norm: NormRect[] = [];
    for (const r of clientRects) {
      // Skip rects that don't overlap this page's box (selection may span pages).
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) {
        continue;
      }
      if (r.width < 1 || r.height < 1) continue;
      const x = (r.left - box.left) / box.width;
      const y = (r.top - box.top) / box.height;
      const w = r.width / box.width;
      const h = r.height / box.height;
      // Clamp into [0,1] (a rect can slightly exceed at the edges).
      norm.push({
        page: pageNumber,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        w: Math.max(0, Math.min(1, w)),
        h: Math.max(0, Math.min(1, h))
      });
    }
    if (norm.length === 0) {
      setPending(null);
      return;
    }
    // Anchor the popup just above the first rect.
    const first = norm[0];
    setPending({
      rects: norm,
      text,
      anchorX: first.x * width,
      anchorY: first.y * height
    });
  }, [pageNumber, width, height]);

  const commit = (color: AnnotationColor) => {
    if (!pending) return;
    onCreate(pending.rects, pending.text, color);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    // The overlay captures text selection (mouseup) to offer a highlight; it is
    // not an interactive control itself, so the static-element a11y rule (which
    // wants a role) doesn't apply here.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={layerRef}
      className='absolute inset-0'
      style={{ width, height }}
      onMouseUp={handleMouseUp}
    >
      {/* Saved highlights — pointer-events only on the rects so text selection
          underneath still works elsewhere. */}
      {highlights.map((hl) =>
        hl.rects
          .filter((r) => r.page === pageNumber)
          .map((r, i) => (
            <button
              key={`${hl.id}-${i}`}
              type='button'
              onClick={() => setActiveId(activeId === hl.id ? null : hl.id)}
              className='absolute cursor-pointer'
              style={{
                left: r.x * width,
                top: r.y * height,
                width: r.w * width,
                height: r.h * height,
                backgroundColor: HIGHLIGHT_FILL[hl.color],
                mixBlendMode: 'multiply'
              }}
              aria-label={hl.text}
            />
          ))
      )}

      {/* Per-highlight mini toolbar (delete) when one is active. */}
      {activeId &&
        (() => {
          const hl = highlights.find((h) => h.id === activeId);
          const first = hl?.rects.find((r) => r.page === pageNumber);
          if (!hl || !first) return null;
          return (
            <div
              className='absolute z-20 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md'
              style={{
                left: Math.min(first.x * width, width - 40),
                top: Math.max(0, first.y * height - 34)
              }}
            >
              <button
                type='button'
                onClick={() => {
                  onDelete(hl.id);
                  setActiveId(null);
                }}
                className='rounded p-1 text-destructive hover:bg-muted'
                aria-label='Delete highlight'
              >
                <IconTrash className='size-4' />
              </button>
            </div>
          );
        })()}

      {/* Color picker popup for a fresh selection. */}
      {pending && (
        <div
          className='absolute z-30 flex items-center gap-1.5 rounded-full border bg-popover px-2 py-1.5 shadow-lg'
          style={{
            left: Math.min(Math.max(0, pending.anchorX), width - 160),
            top: Math.max(0, pending.anchorY - 40)
          }}
        >
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type='button'
              onClick={() => commit(c)}
              className={cn(
                'size-5 rounded-full border border-black/10 transition-transform hover:scale-110'
              )}
              style={{ backgroundColor: COLOR_SWATCH[c] }}
              aria-label={`Highlight ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
