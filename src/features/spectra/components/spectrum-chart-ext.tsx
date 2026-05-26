'use client';

/**
 * SpectrumChartExt — charts for TGA / DSC / OCP, controlled by an optional
 * FigureConfig so they plug into the Figure Studio via the registry. Without a
 * config they keep their original defaults (other call sites unaffected).
 * @phase R160-spectra-3c-hotfix3 · R211 (R5.6 — Studio for TGA/DSC/OCP)
 */

import dynamic from 'next/dynamic';

import {
  type FigureConfig,
  type TraceConfig,
  type TraceDescriptor
} from '@/features/spectra/figure-config';
import type { DSCParsedData, OCPParsedData, TGAParsedData } from '@/types/spectra-analysis-ext';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

const MASS_COLOR = '#1f4e9c';
const DTG_COLOR = '#c0392b';
const HEATFLOW_COLOR = '#1f4e9c';
const ENDO_COLOR = '#2563eb';
const EXO_COLOR = '#ea580c';
const OCP_COLOR = '#1f4e9c';
const EQ_COLOR = '#c0392b';

// ── trace descriptors per chart (registry reads these) ──
export function getTgaTraceDescriptors(): TraceDescriptor[] {
  return [
    { id: 'mass', label: 'Mass (%)', defaultColor: MASS_COLOR },
    { id: 'dtg', label: 'DTG (-dm/dT)', defaultColor: DTG_COLOR, secondaryAxis: true }
  ];
}
export function getDscTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'heatflow', label: 'Heat flow', defaultColor: HEATFLOW_COLOR }];
}
export function getOcpTraceDescriptors(): TraceDescriptor[] {
  return [{ id: 'potential', label: 'Potential', defaultColor: OCP_COLOR }];
}

function traceStyle(cfg: TraceConfig | undefined, fallbackColor: string) {
  return {
    color: cfg?.color ?? fallbackColor,
    width: cfg?.lineWidth ?? 1.5,
    dash: cfg?.lineStyle ?? 'solid'
  };
}

function frameAxes(config: FigureConfig | undefined, closedDefault = false) {
  return {
    showGrid: config?.showGrid ?? true,
    closedFrame: config?.closedFrame ?? closedDefault,
    ticks: (config?.ticksInside ? 'inside' : 'outside') as 'inside' | 'outside',
    showLegend: config?.showLegend ?? true,
    revision: config ? JSON.stringify(config) : 'static',
    layoutKey: config
      ? `${config.showLegend}-${config.closedFrame}-${config.showGrid}-${config.ticksInside}`
      : 'static'
  };
}

export function TGAChart({ parsed, config }: { parsed: TGAParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  const byId = (id: string) => config?.traces.find((t) => t.id === id);
  const massCfg = byId('mass');
  const dtgCfg = byId('dtg');
  const f = frameAxes(config);

  const traces: Array<Record<string, unknown>> = [];
  if (massCfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: massCfg?.label ?? 'Mass (%)',
      line: traceStyle(massCfg, MASS_COLOR),
      yaxis: 'y'
    });
  }
  if (dtgCfg?.visible ?? true) {
    traces.push({
      x: parsed.dtg_curve.x,
      y: parsed.dtg_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: dtgCfg?.label ?? 'DTG (-dm/dT)',
      line: traceStyle(dtgCfg, DTG_COLOR),
      yaxis: 'y2'
    });
  }

  return (
    <Plot
      key={f.layoutKey}
      data={traces}
      revision={f.revision.length}
      layout={{
        autosize: true,
        height: 420,
        datarevision: f.revision,
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: { text: config?.figureTitle ?? 'TGA / DTG', font: { size: 14 } },
        xaxis: {
          title: {
            text: config?.xTitle ?? `Temperature (${parsed.temp_unit === 'K' ? 'K' : '°C'})`
          },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: f.closedFrame,
          zeroline: false,
          ticks: f.ticks
        },
        yaxis: {
          title: { text: config?.yTitle ?? 'Mass (%)' },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          side: 'left',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: f.ticks
        },
        yaxis2: {
          title: { text: config?.y2Title ?? 'DTG' },
          overlaying: 'y',
          side: 'right',
          gridcolor: 'transparent',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: f.ticks
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: f.showLegend,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'x unified'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function DSCChart({ parsed, config }: { parsed: DSCParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  const hfCfg = config?.traces.find((t) => t.id === 'heatflow');
  const f = frameAxes(config);
  const endoX = parsed.endothermic_peaks.map((p) => p.peak_T);
  const endoY = parsed.endothermic_peaks.map((p) => p.heat_flow);
  const exoX = parsed.exothermic_peaks.map((p) => p.peak_T);
  const exoY = parsed.exothermic_peaks.map((p) => p.heat_flow);

  const traces: Array<Record<string, unknown>> = [];
  if (hfCfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: hfCfg?.label ?? 'Heat flow',
      line: traceStyle(hfCfg, HEATFLOW_COLOR)
    });
  }
  // endo/exo markers stay as fixed annotations (not user-styled)
  if (endoX.length > 0) {
    traces.push({
      x: endoX,
      y: endoY,
      type: 'scatter',
      mode: 'markers+text',
      name: 'Endo (Tm)',
      marker: { color: ENDO_COLOR, size: 10, symbol: 'triangle-down' },
      text: parsed.endothermic_peaks.map((_p, i) => `Endo${i + 1}`),
      textposition: 'bottom center'
    });
  }
  if (exoX.length > 0) {
    traces.push({
      x: exoX,
      y: exoY,
      type: 'scatter',
      mode: 'markers+text',
      name: 'Exo (Tc)',
      marker: { color: EXO_COLOR, size: 10, symbol: 'triangle-up' },
      text: parsed.exothermic_peaks.map((_p, i) => `Exo${i + 1}`),
      textposition: 'top center'
    });
  }

  return (
    <Plot
      key={f.layoutKey}
      data={traces}
      revision={f.revision.length}
      layout={{
        autosize: true,
        height: 420,
        datarevision: f.revision,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: config?.figureTitle ?? 'DSC Thermogram', font: { size: 14 } },
        xaxis: {
          title: { text: config?.xTitle ?? 'Temperature (°C)' },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: f.closedFrame,
          zeroline: false,
          ticks: f.ticks
        },
        yaxis: {
          title: { text: config?.yTitle ?? 'Heat flow (mW or W/g)' },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: f.ticks
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: f.showLegend,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function OCPChart({ parsed, config }: { parsed: OCPParsedData; config?: FigureConfig }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  const pCfg = config?.traces.find((t) => t.id === 'potential');
  const f = frameAxes(config);

  const traces: Array<Record<string, unknown>> = [];
  if (pCfg?.visible ?? true) {
    traces.push({
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: pCfg?.label ?? 'Potential',
      line: traceStyle(pCfg, OCP_COLOR)
    });
  }
  // equilibrium reference line stays a fixed annotation
  traces.push({
    x: [parsed.spectrum_curve.x[0], parsed.spectrum_curve.x[parsed.spectrum_curve.x.length - 1]],
    y: [parsed.equilibrium.equilibrium_potential_V, parsed.equilibrium.equilibrium_potential_V],
    type: 'scatter',
    mode: 'lines',
    name: `Eq = ${parsed.equilibrium.equilibrium_potential_V.toFixed(3)} V`,
    line: { color: EQ_COLOR, width: 1.5, dash: 'dash' }
  });

  return (
    <Plot
      key={f.layoutKey}
      data={traces}
      revision={f.revision.length}
      layout={{
        autosize: true,
        height: 380,
        datarevision: f.revision,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: config?.figureTitle ?? 'OCP — Open-Circuit Potential', font: { size: 14 } },
        xaxis: {
          title: { text: config?.xTitle ?? 'Time (s)' },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: f.closedFrame,
          zeroline: false,
          ticks: f.ticks
        },
        yaxis: {
          title: { text: config?.yTitle ?? 'Potential (V vs ref)' },
          showgrid: f.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: f.ticks
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: f.showLegend,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
