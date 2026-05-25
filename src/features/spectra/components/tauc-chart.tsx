'use client';

/**
 * TaucChart — Plotly chart for Tauc plot (αhν)^n vs hν with bandgap fit line.
 * Used by UV-Vis (absorbance) and UV-Vis DRS (Kubelka-Munk F(R)).
 * @phase R160-spectra-3c-hotfix
 */

import dynamic from 'next/dynamic';

import type { SpectrumCurve, TaucBandgapResult } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading Tauc plot…
    </div>
  )
});

interface TaucChartProps {
  curve: SpectrumCurve;
  bandgap: TaucBandgapResult | null;
  yLabel: string;
  title?: string;
}

const CURVE_COLOR = 'hsl(280, 70%, 50%)';
const FIT_COLOR = 'hsl(0, 80%, 55%)';

export function TaucChart({ curve, bandgap, yLabel, title }: TaucChartProps) {
  if (!curve?.x) {
    return <div className='text-sm text-muted-foreground'>Tauc data unavailable</div>;
  }
  const traces: Array<Record<string, unknown>> = [
    {
      x: curve.x,
      y: curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Tauc plot',
      line: { color: CURVE_COLOR, width: 1.5 }
    }
  ];

  // If bandgap was found and we have slope/intercept, draw fit line
  if (bandgap && bandgap.slope !== undefined && bandgap.intercept !== undefined) {
    const [eMin, eMax] = bandgap.fit_range_ev;
    // Extend fit line to bandgap intercept (x-axis crossing)
    const xExtend = Math.max(bandgap.bandgap_ev - 0.2, eMin - 0.3);
    const xFit = [xExtend, eMax];
    const yFit = xFit.map((x) => bandgap.slope! * x + bandgap.intercept!);
    traces.push({
      x: xFit,
      y: yFit,
      type: 'scatter',
      mode: 'lines',
      name: `Eg = ${bandgap.bandgap_ev?.toFixed(2) ?? '—'} eV`,
      line: { color: FIT_COLOR, width: 2, dash: 'dash' }
    });
    // Marker at bandgap point
    traces.push({
      x: [bandgap.bandgap_ev],
      y: [0],
      type: 'scatter',
      mode: 'markers+text',
      name: 'Bandgap',
      marker: { color: FIT_COLOR, size: 12, symbol: 'x' },
      text: [`${bandgap.bandgap_ev?.toFixed(2) ?? '—'} eV`],
      textposition: 'bottom right' as const,
      showlegend: false
    });
  }

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true,
        height: 380,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: title ?? 'Tauc Plot', font: { size: 14 } },
        xaxis: {
          title: { text: 'Photon energy hν (eV)' },
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: { title: { text: yLabel }, gridcolor: 'hsl(var(--border))' },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
