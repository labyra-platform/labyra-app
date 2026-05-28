/**
 * PDF annotation schema (C3a). PRIVATE per-user reading marks — highlights now,
 * freehand drawings in C4. Stored at:
 *   tenants/{tenantId}/papers/{paperId}/annotations/{annotationId}
 *
 * COORDINATE DURABILITY (the whole point of the schema): every geometric value
 * is NORMALIZED to the page's intrinsic, unrotated, scale-1 size — x and width
 * as a fraction of page width, y and height as a fraction of page height, all in
 * [0, 1]. Screen pixels are never stored. This makes a mark survive zoom, the
 * R237m rotation, window resizing, a different monitor, and another device.
 * The viewer converts to/from pixels at render time using the page viewport.
 *
 * Highlights store the selected `text` too, so a later round can list/search/
 * copy them without re-deriving from geometry.
 */

export type AnnotationKind = 'highlight' | 'drawing';

/** A normalized rectangle on a single page (all values in [0, 1]). */
export interface NormRect {
  /** 1-based page number. */
  page: number;
  /** Left edge as a fraction of page width. */
  x: number;
  /** Top edge as a fraction of page height. */
  y: number;
  /** Width as a fraction of page width. */
  w: number;
  /** Height as a fraction of page height. */
  h: number;
}

/** A normalized point on a page (for freehand strokes; C4). */
export interface NormPoint {
  x: number;
  y: number;
}

/** One freehand stroke on a single page (C4). */
export interface DrawingStroke {
  page: number;
  /** Polyline of normalized points; rendered as a smoothed path. */
  points: NormPoint[];
  /** Stroke width as a fraction of page width (so it scales with zoom). */
  width: number;
}

/** Supported highlight colors (kept to a small, named palette). */
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

interface AnnotationBase {
  id: string;
  tenantId: string;
  paperId: string;
  userId: string;
  color: AnnotationColor;
  createdAt: number;
  updatedAt: number;
}

export interface HighlightAnnotation extends AnnotationBase {
  kind: 'highlight';
  /** One rect per text line of the selection. */
  rects: NormRect[];
  /** The selected text (for listing / copy / search). */
  text: string;
  /** Optional user note attached to the highlight. */
  note?: string;
}

export interface DrawingAnnotation extends AnnotationBase {
  kind: 'drawing';
  strokes: DrawingStroke[];
}

export type Annotation = HighlightAnnotation | DrawingAnnotation;

/** Shape written on create (id/timestamps added by the service). */
export type NewAnnotation =
  | Omit<HighlightAnnotation, 'id' | 'createdAt' | 'updatedAt' | 'tenantId' | 'userId'>
  | Omit<DrawingAnnotation, 'id' | 'createdAt' | 'updatedAt' | 'tenantId' | 'userId'>;

export const ANNOTATION_COLORS: readonly AnnotationColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'orange'
] as const;

/** Hex (with alpha) for each highlight color — fill is translucent so the text
 *  underneath stays readable. Used by the render layer (C3b). */
export const HIGHLIGHT_FILL: Record<AnnotationColor, string> = {
  yellow: 'rgba(255, 214, 0, 0.38)',
  green: 'rgba(0, 200, 83, 0.32)',
  blue: 'rgba(41, 121, 255, 0.30)',
  pink: 'rgba(245, 0, 87, 0.28)',
  orange: 'rgba(255, 109, 0, 0.32)'
};
