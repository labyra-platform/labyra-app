'use client';

/**
 * DRSChart — Reflectance curve + Kubelka-Munk F(R) curve overlaid.
 * @phase R160-spectra-3c-hotfix
 */

import dynamic from 'next/dynamic';

import type { SpectrumCurve } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading DRS chart…
    </div>
  )
});

interface DRSChartProps {
  reflectance: SpectrumCurve;
  km: SpectrumCurve;
  reflectanceMode: 'percent' | 'fractional';
}

export function DRSChart({ reflectance, km, reflectanceMode }: DRSChartProps) {
  if (!reflectance?.x || !km?.x) {
    return <div className='text-sm text-muted-foreground'>DRS data incomplete</div>;
  }
  const yLabel = reflectanceMode === 'percent' ? 'Reflectance (%)' : 'Reflectance';
  return (
    <Plot
      data={[
        {
          x: reflectance.x,
          y: reflectance.y,
          type: 'scatter',
          mode: 'lines',
          name: 'Reflectance R(λ)',
          line: { color: 'hsl(200, 70%, 50%)', width: 1.5 },
          yaxis: 'y'
        },
        {
          x: km.x,
          y: km.y,
          type: 'scatter',
          mode: 'lines',
          name: 'F(R) — Kubelka-Munk',
          line: { color: 'hsl(20, 80%, 55%)', width: 1.5 },
          yaxis: 'y2'
        }
      ]}
      layout={{
        autosize: true,
        height: 400,
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: { text: 'DRS — Reflectance & Kubelka-Munk', font: { size: 14 } },
        xaxis: { title: { text: 'Wavelength (nm)' }, gridcolor: 'hsl(var(--border))' },
        yaxis: {
          title: { text: yLabel },
          gridcolor: 'hsl(var(--border))',
          side: 'left'
        },
        yaxis2: {
          title: { text: 'F(R)' },
          overlaying: 'y',
          side: 'right',
          gridcolor: 'transparent'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'x unified'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
