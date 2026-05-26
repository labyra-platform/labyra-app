'use client';

/**
 * DRSChart — Reflectance curve + Kubelka-Munk F(R) curve on a secondary axis.
 * Optionally controlled by a FigureConfig (Figure Studio): the two lines take
 * their style from config.traces ('reflectance', 'fr') and the secondary Y axis
 * from config.y2*. Without a config the original defaults apply.
 * @phase R160-spectra-3c-hotfix · R208 (R5.6 — Figure Studio for DRS)
 */

import dynamic from 'next/dynamic';

import {
  type FigureConfig,
  type TraceConfig,
  type TraceDescriptor
} from '@/features/spectra/figure-config';
import type { SpectrumCurve } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading DRS chart…
    </div>
  )
});

const REFLECTANCE_COLOR = '#2980b9';
const FR_COLOR = '#d4762a';

/** DRS has two editable lines on two Y axes: reflectance (left), F(R) (right). */
export function getDrsTraceDescriptors(): TraceDescriptor[] {
  return [
    { id: 'reflectance', label: 'Reflectance R(λ)', defaultColor: REFLECTANCE_COLOR },
    { id: 'fr', label: 'F(R) — Kubelka-Munk', defaultColor: FR_COLOR, secondaryAxis: true }
  ];
}

interface DRSChartProps {
  reflectance: SpectrumCurve;
  km: SpectrumCurve;
  reflectanceMode: 'percent' | 'fractional';
  config?: FigureConfig;
}

export function DRSChart({ reflectance, km, reflectanceMode, config }: DRSChartProps) {
  if (!reflectance?.x || !km?.x) {
    return <div className='text-sm text-muted-foreground'>DRS data incomplete</div>;
  }
  const yLabel = reflectanceMode === 'percent' ? 'Reflectance (%)' : 'Reflectance';

  const byId = (id: string): TraceConfig | undefined => config?.traces.find((t) => t.id === id);
  const refCfg = byId('reflectance');
  const frCfg = byId('fr');

  const traces: Array<Record<string, unknown>> = [];
  if (refCfg?.visible ?? true) {
    traces.push({
      x: reflectance.x,
      y: reflectance.y,
      type: 'scatter',
      mode: 'lines',
      name: refCfg?.label ?? 'Reflectance R(λ)',
      line: {
        color: refCfg?.color ?? REFLECTANCE_COLOR,
        width: refCfg?.lineWidth ?? 1.5,
        dash: refCfg?.lineStyle ?? 'solid'
      },
      yaxis: 'y'
    });
  }
  if (frCfg?.visible ?? true) {
    traces.push({
      x: km.x,
      y: km.y,
      type: 'scatter',
      mode: 'lines',
      name: frCfg?.label ?? 'F(R) — Kubelka-Munk',
      line: {
        color: frCfg?.color ?? FR_COLOR,
        width: frCfg?.lineWidth ?? 1.5,
        dash: frCfg?.lineStyle ?? 'solid'
      },
      yaxis: 'y2'
    });
  }

  const revision = config ? JSON.stringify(config) : 'static';
  const layoutKey = config
    ? `${config.showLegend}-${config.closedFrame}-${config.showGrid}`
    : 'static';
  const showGrid = config?.showGrid ?? true;
  const closedFrame = config?.closedFrame ?? false;
  const yRange =
    config?.yMin !== null &&
    config?.yMin !== undefined &&
    config?.yMax !== null &&
    config?.yMax !== undefined
      ? [config.yMin, config.yMax]
      : undefined;
  const y2Range =
    config?.y2Min !== null &&
    config?.y2Min !== undefined &&
    config?.y2Max !== null &&
    config?.y2Max !== undefined
      ? [config.y2Min, config.y2Max]
      : undefined;

  return (
    <Plot
      key={layoutKey}
      data={traces}
      revision={revision.length}
      layout={{
        autosize: true,
        height: 400,
        datarevision: revision,
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: {
          text: config?.figureTitle ?? 'DRS — Reflectance & Kubelka-Munk',
          font: { size: 14 }
        },
        xaxis: {
          title: { text: config?.xTitle ?? 'Wavelength (nm)' },
          showgrid: showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: closedFrame,
          zeroline: false,
          ticks: config?.ticksInside ? 'inside' : 'outside'
        },
        yaxis: {
          title: { text: config?.yTitle ?? yLabel },
          range: yRange,
          showgrid: showGrid,
          gridcolor: 'hsl(var(--border))',
          side: 'left',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: config?.ticksInside ? 'inside' : 'outside'
        },
        yaxis2: {
          title: { text: config?.y2Title ?? 'F(R)' },
          range: y2Range,
          overlaying: 'y',
          side: 'right',
          gridcolor: 'transparent',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          zeroline: false,
          ticks: config?.ticksInside ? 'inside' : 'outside'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: config?.showLegend ?? true,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'x unified'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
