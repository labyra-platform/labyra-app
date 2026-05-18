'use client';

/**
 * SpectrumChartExt — chart for TGA / DSC / OCP.
 * Separate file to keep main spectrum-chart.tsx unchanged.
 * @phase R160-spectra-3c-hotfix3
 */

import dynamic from 'next/dynamic';

import type { DSCParsedData, OCPParsedData, TGAParsedData } from '@/types/spectra-analysis-ext';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

const LINE_COLOR = 'hsl(220, 70%, 50%)';
const DTG_COLOR = 'hsl(0, 70%, 55%)';
const ENDO_COLOR = 'hsl(220, 80%, 55%)';
const EXO_COLOR = 'hsl(15, 80%, 55%)';

export function TGAChart({ parsed }: { parsed: TGAParsedData }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  return (
    <Plot
      data={[
        {
          x: parsed.spectrum_curve.x,
          y: parsed.spectrum_curve.y,
          type: 'scatter',
          mode: 'lines',
          name: 'Mass (%)',
          line: { color: LINE_COLOR, width: 1.5 },
          yaxis: 'y'
        },
        {
          x: parsed.dtg_curve.x,
          y: parsed.dtg_curve.y,
          type: 'scatter',
          mode: 'lines',
          name: 'DTG (-dm/dT)',
          line: { color: DTG_COLOR, width: 1.5 },
          yaxis: 'y2'
        }
      ]}
      layout={{
        autosize: true,
        height: 420,
        margin: { l: 60, r: 60, t: 40, b: 50 },
        title: { text: 'TGA / DTG', font: { size: 14 } },
        xaxis: {
          title: {
            text: `Temperature (${parsed.temp_unit === 'K' ? 'K' : '°C'})`
          },
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: {
          title: { text: 'Mass (%)' },
          gridcolor: 'hsl(var(--border))',
          side: 'left'
        },
        yaxis2: {
          title: { text: 'DTG' },
          overlaying: 'y',
          side: 'right',
          gridcolor: 'transparent'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'x unified'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function DSCChart({ parsed }: { parsed: DSCParsedData }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  const endoX = parsed.endothermic_peaks.map((p) => p.peak_T);
  const endoY = parsed.endothermic_peaks.map((p) => p.heat_flow);
  const exoX = parsed.exothermic_peaks.map((p) => p.peak_T);
  const exoY = parsed.exothermic_peaks.map((p) => p.heat_flow);

  const traces: Array<Record<string, unknown>> = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Heat flow',
      line: { color: LINE_COLOR, width: 1.5 }
    }
  ];
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
      data={traces}
      layout={{
        autosize: true,
        height: 420,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: 'DSC Thermogram', font: { size: 14 } },
        xaxis: {
          title: { text: 'Temperature (°C)' },
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: {
          title: { text: 'Heat flow (mW or W/g)' },
          gridcolor: 'hsl(var(--border))'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function OCPChart({ parsed }: { parsed: OCPParsedData }) {
  if (!parsed?.spectrum_curve?.x) {
    return <div className='text-sm text-muted-foreground'>No spectrum data</div>;
  }
  return (
    <Plot
      data={[
        {
          x: parsed.spectrum_curve.x,
          y: parsed.spectrum_curve.y,
          type: 'scatter',
          mode: 'lines',
          name: 'Potential',
          line: { color: LINE_COLOR, width: 1.5 }
        },
        {
          x: [
            parsed.spectrum_curve.x[0],
            parsed.spectrum_curve.x[parsed.spectrum_curve.x.length - 1]
          ],
          y: [
            parsed.equilibrium.equilibrium_potential_V,
            parsed.equilibrium.equilibrium_potential_V
          ],
          type: 'scatter',
          mode: 'lines',
          name: `Eq = ${parsed.equilibrium.equilibrium_potential_V.toFixed(3)} V`,
          line: { color: DTG_COLOR, width: 1.5, dash: 'dash' }
        }
      ]}
      layout={{
        autosize: true,
        height: 380,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: 'OCP — Open-Circuit Potential', font: { size: 14 } },
        xaxis: { title: { text: 'Time (s)' }, gridcolor: 'hsl(var(--border))' },
        yaxis: {
          title: { text: 'Potential (V vs ref)' },
          gridcolor: 'hsl(var(--border))'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        legend: { orientation: 'h', y: -0.2 },
        hovermode: 'closest'
      }}
      config={{ displaylogo: false, responsive: true }}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
