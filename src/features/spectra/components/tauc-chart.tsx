'use client';

/**
 * TaucChart — Plotly chart for Tauc plot (αhν)^n vs hν with bandgap fit line.
 * Used by UV-Vis (absorbance) and UV-Vis DRS (Kubelka-Munk F(R)).
 * Optionally controlled by a FigureConfig (Figure Studio): when `config` is
 * passed, the curve + fit line take their style from config.traces; otherwise
 * the original defaults apply so other call sites are unaffected.
 * @phase R160-spectra-3c-hotfix · R208 (R5.6 — Figure Studio for Tauc)
 */

import dynamic from 'next/dynamic';

import {
  type FigureConfig,
  type TraceConfig,
  type TraceDescriptor
} from '@/features/spectra/figure-config';
import type { SpectrumCurve, TaucBandgapResult } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading Tauc plot…
    </div>
  )
});

const CURVE_COLOR = '#8e44ad';
const FIT_COLOR = '#c0392b';

/** Tauc has two editable lines: the Tauc curve and the linear bandgap fit. */
export function getTaucTraceDescriptors(): TraceDescriptor[] {
  return [
    { id: 'curve', label: 'Tauc plot', defaultColor: CURVE_COLOR },
    { id: 'fit', label: 'Bandgap fit', defaultColor: FIT_COLOR, defaultLineStyle: 'dash' }
  ];
}

interface TaucChartProps {
  curve: SpectrumCurve;
  bandgap: TaucBandgapResult | null;
  yLabel: string;
  title?: string;
  config?: FigureConfig;
}

export function TaucChart({ curve, bandgap, yLabel, title, config }: TaucChartProps) {
  if (!curve?.x) {
    return <div className='text-sm text-muted-foreground'>Tauc data unavailable</div>;
  }

  const byId = (id: string): TraceConfig | undefined => config?.traces.find((t) => t.id === id);
  const curveCfg = byId('curve');
  const fitCfg = byId('fit');

  const traces: Array<Record<string, unknown>> = [];
  if (curveCfg?.visible ?? true) {
    traces.push({
      x: curve.x,
      y: curve.y,
      type: 'scatter',
      mode: 'lines',
      name: curveCfg?.label ?? 'Tauc plot',
      line: {
        color: curveCfg?.color ?? CURVE_COLOR,
        width: curveCfg?.lineWidth ?? 1.5,
        dash: curveCfg?.lineStyle ?? 'solid'
      }
    });
  }

  // If bandgap was found and we have slope/intercept, draw fit line
  if (
    bandgap &&
    bandgap.slope !== undefined &&
    bandgap.intercept !== undefined &&
    (fitCfg?.visible ?? true)
  ) {
    const [eMin, eMax] = bandgap.fit_range_ev;
    const xExtend = Math.max(bandgap.bandgap_ev - 0.2, eMin - 0.3);
    const xFit = [xExtend, eMax];
    const yFit = xFit.map((x) => bandgap.slope! * x + bandgap.intercept!);
    traces.push({
      x: xFit,
      y: yFit,
      type: 'scatter',
      mode: 'lines',
      name: `${fitCfg?.label ?? 'Fit'} (Eg = ${bandgap.bandgap_ev?.toFixed(2) ?? '—'} eV)`,
      line: {
        color: fitCfg?.color ?? FIT_COLOR,
        width: fitCfg?.lineWidth ?? 2,
        dash: fitCfg?.lineStyle ?? 'dash'
      }
    });
    traces.push({
      x: [bandgap.bandgap_ev],
      y: [0],
      type: 'scatter',
      mode: 'markers+text',
      name: 'Bandgap',
      marker: { color: fitCfg?.color ?? FIT_COLOR, size: 12, symbol: 'x' },
      text: [`${bandgap.bandgap_ev?.toFixed(2) ?? '—'} eV`],
      textposition: 'bottom right' as const,
      showlegend: false
    });
  }

  const revision = config ? JSON.stringify(config) : 'static';
  const layoutKey = config
    ? `${config.showLegend}-${config.closedFrame}-${config.showGrid}`
    : 'static';
  const showGrid = config?.showGrid ?? true;
  const closedFrame = config?.closedFrame ?? false;

  return (
    <Plot
      key={layoutKey}
      data={traces}
      revision={revision.length}
      layout={{
        autosize: true,
        height: 380,
        datarevision: revision,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: config?.figureTitle ?? title ?? 'Tauc Plot', font: { size: 14 } },
        xaxis: {
          title: { text: config?.xTitle ?? 'Photon energy hν (eV)' },
          range:
            config?.xMin !== null &&
            config?.xMin !== undefined &&
            config?.xMax !== null &&
            config?.xMax !== undefined
              ? [config.xMin, config.xMax]
              : undefined,
          showgrid: showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: closedFrame,
          zeroline: false,
          ticks: 'outside'
        },
        yaxis: {
          title: { text: config?.yTitle ?? yLabel },
          range:
            config?.yMin !== null &&
            config?.yMin !== undefined &&
            config?.yMax !== null &&
            config?.yMax !== undefined
              ? [config.yMin, config.yMax]
              : undefined,
          showgrid: showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: closedFrame,
          zeroline: false,
          ticks: 'outside'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: config?.showLegend ?? true,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
