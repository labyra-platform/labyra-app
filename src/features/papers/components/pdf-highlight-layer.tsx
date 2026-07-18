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

import { Icons } from '@/components/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationColor, HighlightAnnotation, NormRect } from '@/types/annotations';
import { ANNOTATION_COLORS, HIGHLIGHT_FILL } from '@/types/annotations';
import { IconCopy, IconLanguage } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useSelectionActionStore } from '@/features/papers/stores/selection-action-store';

/**
 * R570: merge per-fragment rects into one bar per line.
 *
 * range.getClientRects() returns a rect for every inline box, not every line.
 * A line dense with formulae — subscripts, superscripts, charge labels — is
 * dozens of spans at slightly different heights, so it comes back as dozens of
 * short, misaligned rectangles that overlap and leave gaps. That is the ragged
 * look; the browser is describing fragments and we were drawing them raw. Edge's
 * PDF viewer coalesces them per line before painting, and this does the same.
 *
 * Done at render, not on the stored data: highlights already saved as shattered
 * rects redraw as clean bars with no migration.
 *
 * Rects on the same visual line share a y that differs only by sub/superscript
 * offset. Group by y within a tolerance (half a line height), then for each
 * group take the outermost top/bottom and span left→right across the whole line.
 */
function mergeRectsByLine(rects: NormRect[]): NormRect[] {
  if (rects.length <= 1) return rects;
  const sorted = rects.toSorted((a, b) => a.y - b.y || a.x - b.x);
  // Tolerance from the median rect height — a real line break exceeds it, a
  // superscript does not. Median resists the odd tall rect from a bracket.
  const heights = sorted.map((r) => r.h).toSorted((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 0.02;
  const tol = medianH * 0.6;

  const lines: NormRect[][] = [];
  for (const r of sorted) {
    const line = lines.at(-1);
    // Same line if this rect's vertical centre sits within tolerance of the
    // line's centre. Centre, not top: a superscript shares the line but has a
    // higher top.
    if (line) {
      const lc = line[0].y + line[0].h / 2;
      const rc = r.y + r.h / 2;
      if (Math.abs(rc - lc) <= tol) {
        line.push(r);
        continue;
      }
    }
    lines.push([r]);
  }

  return lines.map((line) => {
    const top = Math.min(...line.map((r) => r.y));
    const bottom = Math.max(...line.map((r) => r.y + r.h));
    const left = Math.min(...line.map((r) => r.x));
    const right = Math.max(...line.map((r) => r.x + r.w));
    return { page: line[0].page, x: left, y: top, w: right - left, h: bottom - top };
  });
}

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
  enabled,
  onCreate,
  onDelete
}: {
  pageNumber: number;
  width: number;
  height: number;
  highlights: HighlightAnnotation[];
  /** When true the layer turns a text selection into a highlight. When false
   *  it only renders saved marks (so text selection = normal copy). */
  enabled: boolean;
  onCreate: (rects: NormRect[], text: string, color: AnnotationColor) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('papers');
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Where the right-click landed, relative to this page's layer. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const send = useSelectionActionStore((st) => st.send);

  // On mouseup, read the selection and convert its client rects into normalized
  // rects relative to THIS page's layer box. Ignore selections outside the page.
  //
  // IMPORTANT: this listens on `document`, NOT on the overlay div. The overlay
  // is pointer-events:none so the user's drag goes through to react-pdf's text
  // layer underneath (otherwise the overlay eats the drag and there is no
  // selection at all — the bug this fixes). We therefore can't rely on an
  // onMouseUp on the overlay; we listen globally and filter by page box.
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
    // R570: store the merged bars, not the fragments. Render merges too, so old
    // data looks right either way — but new highlights save clean, and the
    // popup anchors to a real line instead of the first shard.
    const merged = mergeRectsByLine(norm);
    // Anchor the popup just above the first rect.
    const first = merged[0];
    setPending({
      rects: merged,
      text,
      anchorX: first.x * width,
      anchorY: first.y * height
    });
  }, [pageNumber, width, height]);

  // R539: the selection is read whether or not the highlight tool is on.
  //
  // It used to be dropped the moment `enabled` was false, which was right when
  // a selection could only become a highlight. Now it can also become a
  // question, a translation, a copy or a search, and those are not a mode — you
  // do not turn on a tool to copy a sentence.
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Right-click over a live selection opens our menu instead of the browser's.
  //
  // Only over a selection, and only over this page. Elsewhere the browser's
  // menu is left alone: it carries Inspect, Print and Chrome's own translate,
  // and taking those away everywhere to add five items here would be a trade
  // nobody asked for.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const layer = layerRef.current;
      if (!layer) return;
      const box = layer.getBoundingClientRect();
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      if (!inside) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      e.preventDefault();
      // R571: the menu renders on `pending && menuAt`, and every item reads
      // pending.text. A drag sets pending; a right-click set only menuAt, so
      // pending stayed null, the condition never held, and the menu never
      // appeared on right-click — translate included. Build pending from the
      // current selection first, exactly as a drag would, then open the menu.
      // handleMouseUp already does that conversion (getClientRects → merge);
      // reusing it means right-click and drag can never diverge.
      handleMouseUp();
      setMenuAt({ x: e.clientX - box.left, y: e.clientY - box.top });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [handleMouseUp]);

  // A new drag replaces the old menu rather than leaving it pinned to text that
  // is no longer selected.
  useEffect(() => {
    if (pending === null) setMenuAt(null);
  }, [pending]);

  const dismiss = useCallback(() => {
    setMenuAt(null);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const commit = (color: AnnotationColor) => {
    if (!pending) return;
    onCreate(pending.rects, pending.text, color);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    // The overlay is pointer-events:none so a drag selects react-pdf's text
    // layer underneath. Selection is captured via a document-level mouseup
    // (see effect above). Saved marks + popups re-enable pointer events so they
    // remain clickable.
    <div ref={layerRef} className='pointer-events-none absolute inset-0' style={{ width, height }}>
      {/* Saved highlights — pointer-events on the rects so they're clickable;
          the container stays none so selection works elsewhere. */}
      {highlights.map((hl) =>
        mergeRectsByLine(hl.rects.filter((r) => r.page === pageNumber)).map((r, i) => (
          <button
            key={`${hl.id}-${i}`}
            type='button'
            onClick={() => setActiveId(activeId === hl.id ? null : hl.id)}
            className='pointer-events-auto absolute cursor-pointer'
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
              className='pointer-events-auto absolute z-20 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md'
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
                <Icons.trash className='size-4' />
              </button>
            </div>
          );
        })()}

      {/* R539: the selection menu. Vertical, because it opens on right-click and
          a context menu is a list — a horizontal strip under the cursor would be
          a floating toolbar wearing a context menu's trigger.

          Order is argued, not alphabetical:
            Ask AI      alone at the top — the only item that makes something new
            Copy · Translate · Search   things done *to* the sentence you picked
            Highlight   last, because choosing a colour ends the gesture
      */}
      {pending && menuAt && (
        <div
          className='pointer-events-auto absolute z-30 min-w-44 rounded-lg border bg-popover p-1 shadow-lg'
          style={{
            left: Math.min(menuAt.x, Math.max(0, width - 180)),
            top: Math.min(menuAt.y, Math.max(0, height - 200))
          }}
          role='menu'
        >
          <button
            type='button'
            role='menuitem'
            onClick={() => {
              send('ask', pending.text, pageNumber);
              dismiss();
            }}
            className='text-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium hover:bg-accent'
          >
            <Icons.sparkles className='size-4 shrink-0' aria-hidden />
            {t('selectionAsk')}
          </button>

          <div className='bg-border my-1 h-px' />

          <button
            type='button'
            role='menuitem'
            onClick={() => {
              void navigator.clipboard.writeText(pending.text);
              dismiss();
            }}
            className='text-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'
          >
            <IconCopy className='size-4 shrink-0' aria-hidden />
            {t('selectionCopy')}
          </button>
          <button
            type='button'
            role='menuitem'
            onClick={() => {
              send('translate', pending.text, pageNumber);
              dismiss();
            }}
            className='text-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'
          >
            <IconLanguage className='size-4 shrink-0' aria-hidden />
            {t('selectionTranslate')}
          </button>
          <button
            type='button'
            role='menuitem'
            onClick={() => {
              // noopener/noreferrer: a search engine has no business with a
              // handle to the reader's window.
              window.open(
                `https://www.google.com/search?q=${encodeURIComponent(pending.text.slice(0, 300))}`,
                '_blank',
                'noopener,noreferrer'
              );
              dismiss();
            }}
            className='text-body flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent'
          >
            <Icons.search className='size-4 shrink-0' aria-hidden />
            {t('selectionSearch')}
          </button>

          <div className='bg-border my-1 h-px' />

          <div className='px-2 py-1.5'>
            <p className='text-muted-foreground text-meta mb-1.5'>{t('selectionHighlight')}</p>
            <div className='flex items-center gap-1.5'>
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  type='button'
                  role='menuitem'
                  onClick={() => commit(c)}
                  className='size-5 rounded-full border border-black/10 transition-transform hover:scale-110'
                  style={{ backgroundColor: COLOR_SWATCH[c] }}
                  aria-label={t('selectionHighlightColor', { color: c })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Highlight-tool mode keeps its one-tap colour row: the tool is already
          the answer to "what do you want to do", so asking again is a step. */}
      {pending && enabled && !menuAt && (
        <div
          className='pointer-events-auto absolute z-30 flex items-center gap-1.5 rounded-full border bg-popover px-2 py-1.5 shadow-lg'
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
              className='size-5 rounded-full border border-black/10 transition-transform hover:scale-110'
              style={{ backgroundColor: COLOR_SWATCH[c] }}
              aria-label={t('selectionHighlightColor', { color: c })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
