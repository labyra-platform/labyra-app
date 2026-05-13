'use client';

/**
 * SpectrumChart — Plotly chart dispatcher.
 * Renders peak markers + axis labels per spectrum type.
 * @phase R160-spectra-3c
 */

import dynamic from 'next/dynamic';

import type { SpectrumParsedData } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

interface SpectrumChartProps {
  parsed: SpectrumParsedData;
}

function getChartConfig(parsed: SpectrumParsedData) {
  if (parsed.spectrum_type === 'xrd') {
    return {
      title: 'XRD Diffractogram',
      xAxis: '2θ (°)',
      yAxis: 'Intensity (counts)',
      xValues: parsed.peaks.map((p) => p.two_theta),
      yValues: parsed.peaks.map((p) => p.intensity),
      fwhm: parsed.peaks.map((p) => p.fwhm),
      xRange: parsed.quick_stats.xRange,
      hoverFormat: (i: number) => `2θ = ${parsed.peaks[i].two_theta.toFixed(3)}°`
    };
  }
  if (parsed.spectrum_type === 'uvvis') {
    return {
      title: 'UV-Vis Absorption',
      xAxis: 'Wavelength (nm)',
      yAxis: 'Absorbance',
      xValues: parsed.peaks.map((p) => p.wavelength_nm),
      yValues: parsed.peaks.map((p) => p.absorbance),
      fwhm: parsed.peaks.map(() => 0),
      xRange: parsed.quick_stats.xRange,
      hoverFormat: (i: number) =>
        `λ = ${parsed.peaks[i].wavelength_nm.toFixed(2)} nm (${parsed.peaks[i].energy_ev.toFixed(2)} eV)`
    };
  }
  if (parsed.spectrum_type === 'raman') {
    return {
      title: 'Raman Spectrum',
      xAxis: 'Raman shift (cm⁻¹)',
      yAxis: 'Intensity (a.u.)',
      xValues: parsed.peaks.map((p) => p.shift_cm1),
      yValues: parsed.peaks.map((p) => p.intensity),
      fwhm: parsed.peaks.map((p) => p.fwhm),
      xRange: parsed.quick_stats.xRange,
      hoverFormat: (i: number) => `ν = ${parsed.peaks[i].shift_cm1.toFixed(2)} cm⁻¹`
    };
  }
  // ftir
  return {
    title: 'FTIR Spectrum',
    xAxis: 'Wavenumber (cm⁻¹)',
    yAxis: parsed.y_mode === 'transmittance' ? '%T' : 'Absorbance',
    xValues: parsed.peaks.map((p) => p.wavenumber_cm1),
    yValues: parsed.peaks.map((p) => p.absorbance),
    fwhm: parsed.peaks.map((p) => p.fwhm),
    // FTIR conventional: high wavenumber on left (reverse)
    xRange: [...parsed.quick_stats.xRange].reverse() as [number, number],
    hoverFormat: (i: number) => `ν = ${parsed.peaks[i].wavenumber_cm1.toFixed(1)} cm⁻¹`
  };
}

export function SpectrumChart({ parsed }: SpectrumChartProps) {
  const cfg = getChartConfig(parsed);

  const peakTrace = {
    x: cfg.xValues,
    y: cfg.yValues,
    mode: 'text+markers' as const,
    type: 'scatter' as const,
    name: 'Peaks',
    text: cfg.xValues.map((_, i) => `${i + 1}`),
    textposition: 'top center' as const,
    marker: {
      color: 'hsl(220, 90%, 60%)',
      size: 8,
      symbol: 'triangle-down' as const,
      line: { color: 'white', width: 1 }
    },
    hovertemplate: '%{customdata}<br>I = %{y:.3f}<extra></extra>',
    customdata: cfg.xValues.map((_, i) => cfg.hoverFormat(i))
  };

  return (
    <Plot
      data={[peakTrace]}
      layout={{
        autosize: true,
        height: 400,
        margin: { l: 60, r: 30, t: 30, b: 50 },
        title: { text: cfg.title, font: { size: 14 } },
        xaxis: {
          title: { text: cfg.xAxis },
          range: cfg.xRange,
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: {
          title: { text: cfg.yAxis },
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
