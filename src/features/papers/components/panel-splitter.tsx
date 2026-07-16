'use client';

/**
 * PanelSplitter — a WAI-ARIA window splitter between the reader and the AI panel.
 *
 * Drag-only is the common mistake: it locks keyboard users at one width
 * forever. This is a `role="separator"` with `tabIndex=0`, so the width is
 * reachable by anyone.
 *
 * | Input             | Action        |
 * |-------------------|---------------|
 * | Drag              | free resize   |
 * | ← / →             | ±16px         |
 * | Shift + ← / →     | ±48px         |
 * | Home / End        | max / min     |
 * | Double-click      | reset default |
 *
 * **The PDF must not re-render while dragging.** The reader is fit-width, so
 * every `pointermove` that reaches React would relayout every page — visible
 * stutter on a 1107-page book. So the drag writes the width straight to the DOM
 * and commits to the store only on `pointerup`. `aria-valuenow` is written the
 * same way, because a separator that reports its value once per gesture is
 * lying to a screen reader for the whole gesture.
 *
 * 9px hit area around a 3px grip: 3px is a coin toss to hit with a mouse, and
 * a wide invisible target is free.
 *
 * @phase R530 — resizable AI panel
 */
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PanelSplitterProps {
  /** Current committed width, px. */
  width: number;
  min: number;
  max: number;
  /** Called on pointerup / keyboard step — this is what persists. */
  onCommit: (width: number) => void;
  /** Called on double-click. */
  onReset: () => void;
  /** Live-resize target: the panel element whose width the drag writes to. */
  panelRef: React.RefObject<HTMLElement | null>;
}

export function PanelSplitter({
  width,
  min,
  max,
  onCommit,
  onReset,
  panelRef
}: PanelSplitterProps) {
  const t = useTranslations('papers');
  const selfRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const live = useRef(width);

  const paint = useCallback(
    (next: number) => {
      live.current = next;
      if (panelRef.current) panelRef.current.style.width = `${next}px`;
      // Written directly rather than through React: see the note above about
      // reporting a value once per gesture.
      selfRef.current?.setAttribute('aria-valuenow', String(next));
    },
    [panelRef]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      live.current = width;
      selfRef.current?.setPointerCapture(e.pointerId);
      // The reader is a text surface; without this the whole page selects while
      // dragging and the drag ends holding a paragraph.
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [width]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || !panelRef.current) return;
      // The panel is docked right, so a drag to the left makes it wider.
      const right = panelRef.current.getBoundingClientRect().right;
      paint(Math.round(Math.max(min, Math.min(right - e.clientX, max))));
    },
    [min, max, paint, panelRef]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      selfRef.current?.releasePointerCapture(e.pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // Commit once. This is the render the PDF pays for, and it happens after
      // the gesture rather than sixty times during it.
      onCommit(live.current);
    },
    [onCommit]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 48 : 16;
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = width + step;
      else if (e.key === 'ArrowRight') next = width - step;
      else if (e.key === 'Home') next = max;
      else if (e.key === 'End') next = min;
      if (next === null) return;
      e.preventDefault();
      onCommit(Math.round(Math.max(min, Math.min(next, max))));
    },
    [width, min, max, onCommit]
  );

  return (
    <div
      ref={selfRef}
      role='separator'
      aria-orientation='vertical'
      aria-label={t('splitterLabel')}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={cn(
        'group relative w-[9px] shrink-0 cursor-col-resize touch-none',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
      )}
    >
      <span
        aria-hidden='true'
        className='bg-border group-hover:bg-primary group-focus-visible:bg-primary absolute inset-y-0 left-[3px] w-[3px] transition-colors'
      />
    </div>
  );
}
