'use client';

/**
 * PdfDrawLayer (C4) — per-page canvas overlay for freehand drawing. Reuses the
 * C3a annotation foundation (kind: 'drawing'). Like highlights, every point is
 * stored NORMALIZED (0..1 of the page box), and stroke width is a fraction of
 * page width, so drawings survive zoom/resize. Created/shown only at rotation 0
 * (the parent gates this).
 *
 * Two responsibilities:
 *  - render saved drawings (always, when this layer is mounted), and
 *  - when `active` (Draw mode on), capture pointer strokes and emit one
 *    DrawingAnnotation per stroke on pointer-up.
 */

import { useEffect, useRef } from 'react';
import type { AnnotationColor, DrawingAnnotation, NormPoint } from '@/types/annotations';

const STROKE_COLOR: Record<AnnotationColor, string> = {
  yellow: '#F5B400',
  green: '#00A152',
  blue: '#2962FF',
  pink: '#D81B60',
  orange: '#F4511E'
};

/** Pointer position as a normalized point (0..1) within the target canvas. */
function pointerToNorm(e: React.PointerEvent): NormPoint {
  const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  };
}

export function PdfDrawLayer({
  pageNumber,
  width,
  height,
  drawings,
  active,
  color,
  penWidth,
  onCreateStroke
}: {
  pageNumber: number;
  width: number;
  height: number;
  drawings: DrawingAnnotation[];
  active: boolean;
  color: AnnotationColor;
  /** Pen width as a fraction of page width (matches stored stroke width). */
  penWidth: number;
  onCreateStroke: (points: NormPoint[], width: number, color: AnnotationColor) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<NormPoint[]>([]);

  // Draw saved strokes + (live) the in-progress stroke onto the canvas.
  const repaint = (live?: NormPoint[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paintStroke = (pts: NormPoint[], w: number, stroke: string) => {
      if (pts.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, w * width);
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * width, pts[i].y * height);
      ctx.stroke();
    };

    for (const d of drawings) {
      const c = STROKE_COLOR[d.color];
      for (const s of d.strokes) {
        if (s.page === pageNumber) paintStroke(s.points, s.width, c);
      }
    }
    if (live && live.length > 0) paintStroke(live, penWidth, STROKE_COLOR[color]);
  };

  // Repaint whenever inputs change (saved strokes, size, color).
  useEffect(() => {
    repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, width, height, pageNumber, color, penWidth]);

  const toNorm = pointerToNorm;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    currentRef.current = [toNorm(e)];
    repaint(currentRef.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !drawingRef.current) return;
    currentRef.current.push(toNorm(e));
    repaint(currentRef.current);
  };
  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = currentRef.current;
    currentRef.current = [];
    // Ignore stray taps (need at least a tiny line).
    if (pts.length >= 2) onCreateStroke(pts, penWidth, color);
    repaint();
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role='img'
      aria-label='Drawing layer'
      className='absolute inset-0'
      style={{
        width,
        height,
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? 'crosshair' : 'default',
        touchAction: active ? 'none' : 'auto'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerLeave={finishStroke}
    />
  );
}
