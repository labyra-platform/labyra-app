'use client';

/**
 * PeaksChart — Plotly XRD diffractogram with peak markers.
 * @phase R160-spectra-3b
 *
 * Uses react-plotly.js (dynamic import to avoid SSR).
 */

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import type { XRDParsedData } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

interface PeaksChartProps {
  parsed: XRDParsedData;
}

export function PeaksChart({ parsed }: PeaksChartProps) {
  const t = useTranslations('spectra.chart');

  // Peak markers as a scatter trace
  const peakTrace = {
    x: parsed.peaks.map((p) => p.two_theta),
    y: parsed.peaks.map((p) => p.intensity),
    mode: 'text+markers' as const,
    type: 'scatter' as const,
    name: t('peaks'),
    text: parsed.peaks.map((p, i) => `${i + 1}`),
    textposition: 'top center' as const,
    marker: {
      color: 'hsl(220, 90%, 60%)',
      size: 8,
      symbol: 'triangle-down' as const,
      line: { color: 'white', width: 1 }
    },
    hovertemplate:
      '<b>Peak %{text}</b><br>' +
      '2θ = %{x:.3f}°<br>' +
      'I = %{y:.1f}<br>' +
      'FWHM = %{customdata:.3f}°<extra></extra>',
    customdata: parsed.peaks.map((p) => p.fwhm)
  };

  return (
    <Plot
      data={[peakTrace]}
      layout={{
        autosize: true,
        height: 400,
        margin: { l: 60, r: 30, t: 20, b: 50 },
        xaxis: {
          title: { text: '2θ (°)' },
          range: parsed.quick_stats.xRange,
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: {
          title: { text: 'Intensity (counts)' },
          gridcolor: 'hsl(var(--border))'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: false,
        hovermode: 'closest'
      }}
      config={{
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d']
      }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
