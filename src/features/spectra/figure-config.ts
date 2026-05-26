/**
 * Figure configuration — the serializable view-state for ANY plottable figure.
 *
 * Trace-based (v2): a figure is a list of traces (lines) each with its own
 * style, plus figure-wide style (axes/title/grid/legend) and optional
 * technique-specific style (peaks, secondary Y axis). This decouples the Figure
 * Studio from any single chart type — every chart (single-curve spectra,
 * two-axis DRS/TGA, Tauc with fit line) declares its traces via a
 * TraceDescriptor[] and is then editable through the same modal.
 *
 * Kept plain JSON-able (no functions/DOM refs) for Firestore persistence (R5.4)
 * and safe merge/migration of stale configs.
 *
 * @phase R207 (R5.5 — trace-based Figure Studio)
 */

export type PeakLabelMode = 'none' | 'number' | 'value' | 'group';
export type LineStyle = 'solid' | 'dash' | 'dot';

/** Per-trace (per-line) appearance. One figure has one or more of these. */
export interface TraceConfig {
  /** stable id matching the chart's TraceDescriptor (e.g. 'reflectance', 'fr', 'fit') */
  id: string;
  /** human label shown in the panel + legend (e.g. 'Reflectance R(λ)') */
  label: string;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  visible: boolean;
  /** true if this trace is plotted against the secondary (right) Y axis */
  secondaryAxis?: boolean;
}

export interface FigureConfig {
  /** schema version — bump when fields change so persisted configs migrate safely */
  version: 2;
  /** per-line styles; length depends on the chart (1 for single-curve spectra) */
  traces: TraceConfig[];
  // figure-wide style (every plottable figure has these)
  reverseX: boolean;
  showGrid: boolean;
  showLegend: boolean;
  /** close the top + right axis frame (boxed-axes convention) */
  closedFrame: boolean;
  /** axis title overrides — null means "use the chart default" */
  figureTitle: string | null;
  xTitle: string | null;
  yTitle: string | null;
  /** secondary (right) Y axis title — only used by two-axis charts (DRS/TGA) */
  y2Title: string | null;
  /** axis range overrides — null means "auto" */
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  y2Min: number | null;
  y2Max: number | null;
  // technique-specific (charts that don't support these just ignore them)
  showPeaks: boolean;
  peakLabel: PeakLabelMode;
}

/**
 * What a chart declares about its lines so the Figure Studio can build the right
 * controls without knowing the technique. A single-curve spectrum returns one;
 * DRS returns two (reflectance + F(R)), Tauc returns two (curve + fit), etc.
 */
export interface TraceDescriptor {
  id: string;
  label: string;
  defaultColor: string;
  defaultLineStyle?: LineStyle;
  /** plotted on the secondary (right) Y axis */
  secondaryAxis?: boolean;
}

/** Capabilities a chart opts into, so the modal hides irrelevant controls. */
export interface FigureCapabilities {
  /** chart draws detected peaks (only single-curve spectra) */
  peaks: boolean;
  /** chart has a secondary Y axis (DRS, TGA) */
  secondaryAxis: boolean;
}

/** Quick swatches in the colour picker. */
export const LINE_COLOR_SWATCHES = [
  '#1f4e9c', // blue (default)
  '#333333', // near-black (print)
  '#c0392b', // red
  '#218c5a', // green
  '#d4762a' // orange
];

/**
 * Colorblind-safe scientific palettes (Origin has none — a Labyra edge).
 * Okabe-Ito is the de-facto accessible standard; viridis is perceptually
 * uniform; grayscale is for black-and-white print submission.
 */
export const SCIENTIFIC_PALETTES: Record<string, { label: string; colors: string[] }> = {
  okabe_ito: {
    label: 'Okabe-Ito (colorblind-safe)',
    colors: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000']
  },
  viridis: {
    label: 'Viridis',
    colors: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725']
  },
  grayscale: {
    label: 'Grayscale (B&W print)',
    colors: ['#000000', '#404040', '#707070', '#9a9a9a', '#c0c0c0']
  }
};

export const DEFAULT_LINE_COLOR = LINE_COLOR_SWATCHES[0];

/** Build a TraceConfig from a descriptor with sensible defaults. */
function traceFromDescriptor(d: TraceDescriptor): TraceConfig {
  return {
    id: d.id,
    label: d.label,
    color: d.defaultColor,
    lineWidth: 1.5,
    lineStyle: d.defaultLineStyle ?? 'solid',
    visible: true,
    secondaryAxis: d.secondaryAxis ?? false
  };
}

/**
 * Build a fresh config for a chart from its trace descriptors.
 * reverseX defaults to the technique convention (e.g. FTIR true).
 */
export function defaultFigureConfig(
  descriptors: TraceDescriptor[] = [
    { id: 'main', label: 'Series', defaultColor: DEFAULT_LINE_COLOR }
  ],
  reverseX = false
): FigureConfig {
  return {
    version: 2,
    traces: descriptors.map(traceFromDescriptor),
    reverseX,
    showGrid: true,
    showLegend: true,
    closedFrame: true,
    figureTitle: null,
    xTitle: null,
    yTitle: null,
    y2Title: null,
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    y2Min: null,
    y2Max: null,
    showPeaks: true,
    peakLabel: 'number'
  };
}

/** A v1 (single-curve, flat) config as persisted by R5.1, for migration. */
interface FigureConfigV1 {
  version: 1;
  lineColor: string;
  lineWidth: number;
  lineStyle: LineStyle;
  reverseX: boolean;
  showGrid: boolean;
  showLegend: boolean;
  showPeaks: boolean;
  peakLabel: PeakLabelMode;
  xTitle: string | null;
  yTitle: string | null;
  figureTitle: string | null;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
}

/**
 * Migrate/merge a (possibly older or partial) persisted config to a v2 config
 * matching the given descriptors. Trace styles are matched by id; missing
 * traces fall back to descriptor defaults so adding a trace later is safe.
 */
export function migrateFigureConfig(
  stored: Partial<FigureConfig> | FigureConfigV1 | null | undefined,
  descriptors: TraceDescriptor[],
  reverseX = false
): FigureConfig {
  const base = defaultFigureConfig(descriptors, reverseX);
  if (!stored) return base;

  // v1 -> v2: fold the single flat line style into the first trace.
  if (stored.version === 1) {
    const v1 = stored as FigureConfigV1;
    return {
      ...base,
      reverseX: v1.reverseX,
      showGrid: v1.showGrid,
      showLegend: v1.showLegend,
      closedFrame: true,
      showPeaks: v1.showPeaks,
      peakLabel: v1.peakLabel,
      figureTitle: v1.figureTitle,
      xTitle: v1.xTitle,
      yTitle: v1.yTitle,
      xMin: v1.xMin,
      xMax: v1.xMax,
      yMin: v1.yMin,
      yMax: v1.yMax,
      traces: base.traces.map((t, i) =>
        i === 0
          ? { ...t, color: v1.lineColor, lineWidth: v1.lineWidth, lineStyle: v1.lineStyle }
          : t
      )
    };
  }

  // v2 partial: merge figure-wide fields, match traces by id.
  const v2 = stored as Partial<FigureConfig>;
  const storedById = new Map((v2.traces ?? []).map((t) => [t.id, t]));
  return {
    ...base,
    ...v2,
    version: 2,
    traces: base.traces.map((t) => {
      const s = storedById.get(t.id);
      return s ? { ...t, ...s, id: t.id, secondaryAxis: t.secondaryAxis } : t;
    })
  };
}

/** Convenience: update one trace by id, returning a new config. */
export function setTrace(
  config: FigureConfig,
  id: string,
  patch: Partial<TraceConfig>
): FigureConfig {
  return {
    ...config,
    traces: config.traces.map((t) => (t.id === id ? { ...t, ...patch } : t))
  };
}

/** Validate a hex color (#RGB or #RRGGBB). */
export function isValidHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
