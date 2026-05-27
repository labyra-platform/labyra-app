'use client';

/**
 * Electrochemistry charts: Tafel, LSV, CV, EIS. Controlled by an optional
 * FigureConfig so they plug into the Figure Studio via the registry; without a
 * config each keeps publication-sensible defaults.
 * @phase R212 (electrochemistry app support)
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

import {
  type FigureConfig,
  type TraceConfig,
  type TraceDescriptor
} from '@/features/spectra/figure-config';
import type {
  CVParsedData,
  EISParsedData,
  LSVParsedData,
  PECJVParsedData,
  PECMottSchottkyParsedData,
  TafelParsedData
} from '@/types/spectra-analysis-echem';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

const PRIMARY = '#1f4e9c';
const SECONDARY = '#c0392b';
const FIT = '#16a34a';

function styleOf(cfg: TraceConfig | undefined, fallback: string) {
  return {
    color: cfg?.color ?? fallback,
    width: cfg?.lineWidth ?? 1.5,
    dash: cfg?.lineStyle ?? 'solid'
  };
}

function frame(config: FigureConfig | undefined) {
  return {
    showGrid: config?.showGrid ?? true,
    closedFrame: config?.closedFrame ?? false,
    ticksInside: config?.ticksInside ?? false,
    showLegend: config?.showLegend ?? true,
    rev: config ? JSON.stringify(config) : 'static',
    key: config
      ? `${config.showLegend}-${config.closedFrame}-${config.showGrid}-${config.ticksInside}`
      : 'static'
  };
}

function axis(title: string, showgrid: boolean, mirror = false, ticksInside = false) {
  return {
    title: { text: title },
    showgrid,
    gridcolor: 'hsl(var(--border))',
    showline: true,
    linecolor: 'hsl(var(--foreground))',
    linewidth: 1,
    mirror,
    zeroline: false,
    ticks: (ticksInside ? 'inside' : 'outside') as 'inside' | 'outside'
  };
}

const BASE_LAYOUT = {
  autosize: true,
  height: 420,
  margin: { l: 64, r: 30, t: 40, b: 52 },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { family: 'inherit', size: 12 },
  legend: { orientation: 'h' as const, y: -0.2 },
  hovermode: 'closest' as const
};

// ── descriptors ──
export function getTafelTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'tafel', label: 'E vs j', defaultColor: PRIMARY }];
}
export function getLsvTraceDescriptors(parsed: LSVParsedData): TraceDescriptor[] {
  const d: TraceDescriptor[] = [{ id: 'raw', label: 'E vs I', defaultColor: PRIMARY }];
  if (parsed.rhe_curve) d.push({ id: 'rhe', label: 'vs RHE (j)', defaultColor: SECONDARY });
  return d;
}
export function getCvTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'cv', label: 'I vs E', defaultColor: PRIMARY }];
}
export function getEisTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'nyquist', label: "Z' vs -Z''", defaultColor: PRIMARY }];
}

// ============================================================
// Tafel
// ============================================================
export function TafelChart({ parsed, config }: { parsed: TafelParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }
  const cfg = config?.traces.find((t) => t.id === 'tafel');
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];
  if (cfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: cfg?.label ?? 'E vs j',
      line: styleOf(cfg, PRIMARY)
    });
  }
  return (
    <Plot
      key={f.key}
      data={traces}
      revision={f.rev.length}
      layout={{
        ...BASE_LAYOUT,
        datarevision: f.rev,
        title: { text: config?.figureTitle ?? 'Tafel plot', font: { size: 14 } },
        xaxis: axis(config?.xTitle ?? 'Potential (V)', f.showGrid, f.closedFrame, f.ticksInside),
        yaxis: axis(
          config?.yTitle ?? `j (${parsed.quick_stats.current_unit})`,
          f.showGrid,
          false,
          f.ticksInside
        ),
        showlegend: f.showLegend
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ============================================================
// LSV — raw E-I, optional vs-RHE on secondary axis
// ============================================================
export function LSVChart({ parsed, config }: { parsed: LSVParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }
  const rawCfg = config?.traces.find((t) => t.id === 'raw');
  const rheCfg = config?.traces.find((t) => t.id === 'rhe');
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];
  if (rawCfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: rawCfg?.label ?? 'E vs I',
      line: styleOf(rawCfg, PRIMARY),
      yaxis: 'y'
    });
  }
  if (parsed.rhe_curve && (rheCfg?.visible ?? true)) {
    traces.push({
      x: parsed.rhe_curve.x,
      y: parsed.rhe_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: rheCfg?.label ?? 'vs RHE (j)',
      line: styleOf(rheCfg, SECONDARY),
      yaxis: 'y2'
    });
  }
  return (
    <Plot
      key={f.key}
      data={traces}
      revision={f.rev.length}
      layout={{
        ...BASE_LAYOUT,
        datarevision: f.rev,
        margin: { l: 64, r: parsed.rhe_curve ? 64 : 30, t: 40, b: 52 },
        title: { text: config?.figureTitle ?? 'LSV', font: { size: 14 } },
        xaxis: axis(config?.xTitle ?? 'Potential (V)', f.showGrid, f.closedFrame, f.ticksInside),
        yaxis: axis(
          config?.yTitle ?? `Current (${parsed.y_unit})`,
          f.showGrid,
          false,
          f.ticksInside
        ),
        ...(parsed.rhe_curve
          ? {
              yaxis2: {
                ...axis(config?.y2Title ?? 'j (mA/cm²)', false),
                overlaying: 'y',
                side: 'right',
                gridcolor: 'transparent'
              }
            }
          : {}),
        showlegend: f.showLegend
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ============================================================
// CV — cyclic voltammogram (single trace, full sweep)
// ============================================================
export function CVChart({ parsed, config }: { parsed: CVParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }
  const cfg = config?.traces.find((t) => t.id === 'cv');
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];
  if (cfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: cfg?.label ?? 'I vs E',
      line: styleOf(cfg, PRIMARY)
    });
  }
  // anodic/cathodic peak markers (fixed annotations, not user-styled)
  const a = parsed.analysis;
  if (a.Epa_V != null && a.ipa != null) {
    traces.push({
      x: [a.Epa_V],
      y: [a.ipa],
      type: 'scatter',
      mode: 'markers+text',
      name: 'Epa',
      marker: { color: SECONDARY, size: 9, symbol: 'triangle-up' },
      text: ['Epa'],
      textposition: 'top center'
    });
  }
  if (a.Epc_V != null && a.ipc != null) {
    traces.push({
      x: [a.Epc_V],
      y: [a.ipc],
      type: 'scatter',
      mode: 'markers+text',
      name: 'Epc',
      marker: { color: FIT, size: 9, symbol: 'triangle-down' },
      text: ['Epc'],
      textposition: 'bottom center'
    });
  }
  return (
    <Plot
      key={f.key}
      data={traces}
      revision={f.rev.length}
      layout={{
        ...BASE_LAYOUT,
        datarevision: f.rev,
        title: { text: config?.figureTitle ?? 'Cyclic voltammogram', font: { size: 14 } },
        xaxis: axis(config?.xTitle ?? 'Potential (V)', f.showGrid, f.closedFrame, f.ticksInside),
        yaxis: axis(
          config?.yTitle ?? `Current (${parsed.y_unit})`,
          f.showGrid,
          false,
          f.ticksInside
        ),
        showlegend: f.showLegend
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ============================================================
// EIS — Nyquist (Z' vs -Z''), equal aspect for semicircle shape
// ============================================================
export function EISChart({ parsed, config }: { parsed: EISParsedData; config?: FigureConfig }) {
  if (!parsed?.nyquist?.z_real?.length) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }
  const cfg = config?.traces.find((t) => t.id === 'nyquist');
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];
  if (cfg?.visible ?? true) {
    traces.push({
      x: parsed.nyquist.z_real,
      y: parsed.nyquist.z_imag_neg,
      type: 'scatter',
      mode: 'lines+markers',
      name: cfg?.label ?? "Z' vs -Z''",
      line: styleOf(cfg, PRIMARY),
      marker: { size: 5, color: cfg?.color ?? PRIMARY }
    });
  }
  return (
    <Plot
      key={f.key}
      data={traces}
      revision={f.rev.length}
      layout={{
        ...BASE_LAYOUT,
        datarevision: f.rev,
        title: { text: config?.figureTitle ?? 'Nyquist plot', font: { size: 14 } },
        xaxis: axis(config?.xTitle ?? "Z' (Ω)", f.showGrid, f.closedFrame, f.ticksInside),
        // equal aspect: -Z'' scaled to Z' so the semicircle isn't distorted
        yaxis: {
          ...axis(config?.yTitle ?? "-Z'' (Ω)", f.showGrid, false, f.ticksInside),
          scaleanchor: 'x',
          scaleratio: 1
        },
        showlegend: f.showLegend
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ============================================================
// PEC Mott-Schottky — 1/C² vs E with linear fit + Range Selector
// ------------------------------------------------------------
// The worker returns the processed mott_schottky_curve (1/C² vs E) plus the
// auto-suggested linear region. Like Tafel, the user can drag to select a
// potential window and the slope/intercept refit instantly client-side on that
// SAME curve — no re-derivation of carrier density (that needs eps_r and lives
// in Re-analyze). The drag fit shows slope + R² so the scientist can judge the
// linear region by eye (Hankin JMCA 2019 best practice).
// ============================================================
export function getMottSchottkyTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'ms', label: '1/C² vs E', defaultColor: PRIMARY }];
}

function olsFit(x: number[], y: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = x.length;
  if (n < 2) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

export function MottSchottkyChart({
  parsed,
  config
}: {
  parsed: PECMottSchottkyParsedData;
  config?: FigureConfig;
}) {
  const curve = parsed.mott_schottky_curve;
  const a = parsed.analysis;
  // Selected potential window for the client-side range fit. Defaults to the
  // worker's auto-suggested fit range so the chart opens on the right region.
  const [range, setRange] = useState<[number, number] | null>(
    a.fit_range_V ? [a.fit_range_V[0], a.fit_range_V[1]] : null
  );

  const fit = useMemo(() => {
    if (!curve?.x?.length || !range) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < curve.x.length; i++) {
      if (curve.x[i] >= range[0] && curve.x[i] <= range[1]) {
        xs.push(curve.x[i]);
        ys.push(curve.y[i]);
      }
    }
    return olsFit(xs, ys);
  }, [curve, range]);

  if (!curve?.x?.length) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }

  const cfg = config?.traces.find((t) => t.id === 'ms');
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];

  if (cfg?.visible ?? true) {
    traces.push({
      x: curve.x,
      y: curve.y,
      type: 'scatter',
      mode: 'markers',
      name: cfg?.label ?? '1/C² vs E',
      marker: { color: cfg?.color ?? PRIMARY, size: 6 }
    });
  }

  // Fit line over the full x-span, drawn from the current selection's slope.
  if (fit) {
    const xMin = Math.min(...curve.x);
    const xMax = Math.max(...curve.x);
    traces.push({
      x: [xMin, xMax],
      y: [fit.intercept + fit.slope * xMin, fit.intercept + fit.slope * xMax],
      type: 'scatter',
      mode: 'lines',
      name: 'Linear fit',
      line: { color: FIT, width: 2, dash: 'dash' }
    });
    // Flat-band marker: x-intercept of the fitted line (1/C² = 0).
    const xInt = -fit.intercept / fit.slope;
    traces.push({
      x: [xInt],
      y: [0],
      type: 'scatter',
      mode: 'markers+text',
      name: 'E_fb',
      marker: { color: SECONDARY, size: 9, symbol: 'x' },
      text: ['E_fb'],
      textposition: 'top center'
    });
  }

  return (
    <div className='space-y-2'>
      <Plot
        key={f.key}
        data={traces}
        revision={f.rev.length}
        layout={{
          ...BASE_LAYOUT,
          datarevision: f.rev,
          dragmode: 'select',
          selectdirection: 'h',
          title: { text: config?.figureTitle ?? 'Mott-Schottky', font: { size: 14 } },
          xaxis: axis(
            config?.xTitle ?? `Potential (V vs ${parsed.conditions.reference ?? 'ref'})`,
            f.showGrid,
            f.closedFrame,
            f.ticksInside
          ),
          yaxis: axis(config?.yTitle ?? '1/C² (cm⁴ F⁻²)', f.showGrid, false, f.ticksInside),
          showlegend: f.showLegend
        }}
        config={{ displaylogo: false, responsive: true }}
        onSelected={(ev: { range?: { x?: number[] } }) => {
          if (ev?.range?.x && ev.range.x.length === 2) {
            setRange([Math.min(...ev.range.x), Math.max(...ev.range.x)]);
          }
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
        <span>
          Drag to select the linear region.{' '}
          {range ? `Fit: ${range[0].toFixed(2)}–${range[1].toFixed(2)} V` : 'No selection'}
        </span>
        {fit ? (
          <>
            <span>
              slope ={' '}
              <span className='tabular-nums text-foreground'>{fit.slope.toExponential(3)}</span>
            </span>
            <span>
              R² = <span className='tabular-nums text-foreground'>{fit.r2.toFixed(4)}</span>
            </span>
            <span>
              E<sub>fb</sub> ≈{' '}
              <span className='tabular-nums text-foreground'>
                {(-fit.intercept / fit.slope).toFixed(3)} V
              </span>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================
// PEC J-V — photoelectrochemistry under illumination
// ============================================================
export function getPecJvTraceDescriptors(parsed: PECJVParsedData): TraceDescriptor[] {
  const d: TraceDescriptor[] = [{ id: 'jv', label: 'Photocurrent', defaultColor: PRIMARY }];
  if (parsed.light_dark_curve) {
    d.push({ id: 'light', label: 'Light', defaultColor: '#e69f00' });
    d.push({ id: 'dark', label: 'Dark', defaultColor: '#444444' });
  }
  return d;
}

export function PECJVChart({ parsed, config }: { parsed: PECJVParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No data</div>;
  }
  const f = frame(config);
  const traces: Array<Record<string, unknown>> = [];
  if (parsed.light_dark_curve) {
    const lightCfg = config?.traces.find((t) => t.id === 'light');
    const darkCfg = config?.traces.find((t) => t.id === 'dark');
    if (lightCfg?.visible ?? true) {
      traces.push({
        x: parsed.light_dark_curve.light.x,
        y: parsed.light_dark_curve.light.y,
        type: 'scatter',
        mode: 'lines',
        name: lightCfg?.label ?? 'Light',
        line: styleOf(lightCfg, '#e69f00')
      });
    }
    if (darkCfg?.visible ?? true) {
      traces.push({
        x: parsed.light_dark_curve.dark.x,
        y: parsed.light_dark_curve.dark.y,
        type: 'scatter',
        mode: 'lines',
        name: darkCfg?.label ?? 'Dark',
        line: styleOf(darkCfg, '#444444')
      });
    }
  } else {
    const cfg = config?.traces.find((t) => t.id === 'jv');
    if (cfg?.visible ?? true) {
      traces.push({
        x: parsed.spectrum_curve.x,
        y: parsed.spectrum_curve.y,
        type: 'scatter',
        mode: 'lines',
        name: cfg?.label ?? 'Photocurrent',
        line: styleOf(cfg, PRIMARY)
      });
    }
  }
  return (
    <Plot
      key={f.key}
      data={traces}
      revision={f.rev.length}
      layout={{
        ...BASE_LAYOUT,
        datarevision: f.rev,
        title: { text: config?.figureTitle ?? 'PEC J-V', font: { size: 14 } },
        xaxis: axis(
          config?.xTitle ?? 'Potential (V vs RHE)',
          f.showGrid,
          f.closedFrame,
          f.ticksInside
        ),
        yaxis: axis(
          config?.yTitle ?? `j (${parsed.analysis.current_density_unit})`,
          f.showGrid,
          false,
          f.ticksInside
        ),
        showlegend: f.showLegend || parsed.light_dark_curve != null
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
