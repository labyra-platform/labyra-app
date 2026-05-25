'use client';
// R165-phase-1-oxlint: oxlint cleanup

/**
 * SpectrumChart — Plotly chart with full spectrum curve + peak markers.
 * Renders different chart configurations per spectrum type.
 * @phase R160-spectra-3c-hotfix
 */

import dynamic from 'next/dynamic';

import type { FTIRPeak, SpectrumParsedData } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

interface ReferenceCardPeakInput {
  twoTheta: number;
  intensity: number;
  hkl?: string;
}

interface ReferenceCardOverlay {
  id: string;
  cardNumber: string;
  phaseName: string;
  formula?: string;
  peaks: ReferenceCardPeakInput[];
  color: string; // hex/hsl for overlay
}

interface SpectrumChartProps {
  parsed: SpectrumParsedData;
  referenceCards?: ReferenceCardOverlay[];
}

interface PlotData {
  x: number[];
  y: number[];
  type: 'scatter';
  mode: 'lines' | 'markers' | 'lines+markers' | 'text+markers';
  name: string;
  line?: { color: string; width?: number };
  marker?: {
    color: string;
    size?: number;
    symbol?: string;
    line?: { color: string; width: number };
  };
  text?: string[];
  textposition?: 'top center';
  hovertemplate?: string;
  customdata?: number[] | string[];
}

const LINE_COLOR = 'hsl(220, 70%, 50%)';
const PEAK_COLOR = 'hsl(0, 70%, 55%)';

function getXRDTraces(
  parsed: SpectrumParsedData,
  referenceCards: ReferenceCardOverlay[] = []
): PlotData[] {
  if (parsed.spectrum_type !== 'xrd') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Diffractogram',
      line: { color: LINE_COLOR, width: 1.5 }
    }
  ];
  if ((parsed.peaks?.length ?? 0) > 0) {
    traces.push({
      x: (parsed.peaks ?? []).map((p) => p.two_theta),
      y: (parsed.peaks ?? []).map((p) => p.intensity),
      type: 'scatter',
      mode: 'text+markers',
      name: 'Peaks',
      marker: {
        color: PEAK_COLOR,
        size: 8,
        symbol: 'triangle-down',
        line: { color: 'white', width: 1 }
      },
      text: (parsed.peaks ?? []).map((_p, i) => `${i + 1}`),
      textposition: 'top center',
      hovertemplate: '%{customdata}<br>I = %{y:.1f}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p) => `2θ = ${p.two_theta.toFixed(3)}°, FWHM = ${p.fwhm.toFixed(3)}°`
      )
    });
  }

  // Reference card overlays: vertical sticks at reference peak positions
  // Scale to relative intensity within data range
  if (referenceCards.length > 0 && parsed.spectrum_curve.y.length > 0) {
    const yMax = Math.max(...parsed.spectrum_curve.y);
    for (const ref of referenceCards) {
      for (const p of ref.peaks) {
        const yTop = (p.intensity / 100) * yMax;
        traces.push({
          x: [p.twoTheta, p.twoTheta, p.twoTheta],
          y: [0, yTop, null as unknown as number],
          type: 'scatter',
          mode: 'lines',
          name: `${ref.cardNumber} ${ref.formula ?? ref.phaseName}`,
          line: { color: ref.color, width: 1.5 },
          hovertemplate: `${ref.cardNumber}<br>2θ = ${p.twoTheta}°<br>I = ${p.intensity}%${p.hkl ? `<br>hkl: ${p.hkl}` : ''}<extra></extra>`,
          customdata: [p.hkl ?? '', p.hkl ?? '', p.hkl ?? '']
        });
      }
    }
  }
  return traces;
}

function getUVVisTraces(parsed: SpectrumParsedData): PlotData[] {
  if (parsed.spectrum_type !== 'uvvis') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Absorbance',
      line: { color: LINE_COLOR, width: 1.5 }
    }
  ];
  if ((parsed.peaks?.length ?? 0) > 0) {
    traces.push({
      x: (parsed.peaks ?? []).map((p) => p.wavelength_nm),
      y: (parsed.peaks ?? []).map((p) => p.absorbance),
      type: 'scatter',
      mode: 'text+markers',
      name: 'Peaks',
      marker: {
        color: PEAK_COLOR,
        size: 8,
        symbol: 'triangle-down',
        line: { color: 'white', width: 1 }
      },
      text: (parsed.peaks ?? []).map((_p, i) => `${i + 1}`),
      textposition: 'top center',
      hovertemplate: '%{customdata}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p) => `λ = ${p.wavelength_nm.toFixed(2)} nm (${p.energy_ev.toFixed(2)} eV)`
      )
    });
  }
  return traces;
}

function getRamanTraces(parsed: SpectrumParsedData): PlotData[] {
  if (parsed.spectrum_type !== 'raman') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Raman',
      line: { color: LINE_COLOR, width: 1.5 }
    }
  ];
  if ((parsed.peaks?.length ?? 0) > 0) {
    traces.push({
      x: (parsed.peaks ?? []).map((p) => p.shift_cm1),
      y: (parsed.peaks ?? []).map((p) => p.intensity),
      type: 'scatter',
      mode: 'text+markers',
      name: 'Peaks',
      marker: {
        color: PEAK_COLOR,
        size: 8,
        symbol: 'triangle-down',
        line: { color: 'white', width: 1 }
      },
      text: (parsed.peaks ?? []).map((_p, i) => `${i + 1}`),
      textposition: 'top center',
      hovertemplate: '%{customdata}<br>I = %{y:.1f}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p) => `ν = ${p.shift_cm1.toFixed(1)} cm⁻¹, FWHM = ${p.fwhm.toFixed(1)}`
      )
    });
  }
  return traces;
}

function getFTIRTraces(parsed: SpectrumParsedData): PlotData[] {
  if (parsed.spectrum_type !== 'ftir') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: parsed.y_mode === 'transmittance' ? 'Transmittance' : 'Absorbance',
      line: { color: LINE_COLOR, width: 1.5 }
    }
  ];
  if ((parsed.peaks?.length ?? 0) > 0) {
    // Marker y values: convert absorbance back to %T scale if needed for visual position
    const yValues =
      parsed.y_mode === 'transmittance'
        ? (parsed.peaks ?? []).map((p) => 10 ** -p.absorbance * 100)
        : (parsed.peaks ?? []).map((p) => p.absorbance);
    traces.push({
      x: (parsed.peaks ?? []).map((p) => p.wavenumber_cm1),
      y: yValues,
      type: 'scatter',
      mode: 'text+markers',
      name: 'Peaks',
      marker: {
        color: PEAK_COLOR,
        size: 8,
        symbol: 'triangle-down',
        line: { color: 'white', width: 1 }
      },
      text: (parsed.peaks ?? []).map((_p, i) => `${i + 1}`),
      textposition: 'top center',
      hovertemplate: '%{customdata}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p: FTIRPeak) => `ν = ${p.wavenumber_cm1.toFixed(1)} cm⁻¹, FWHM = ${p.fwhm.toFixed(1)}`
      )
    });
  }
  return traces;
}

interface ChartLayout {
  title: string;
  xAxis: string;
  yAxis: string;
  xRange: [number, number];
  reverseX?: boolean;
}

function getLayoutConfig(parsed: SpectrumParsedData): ChartLayout {
  if (parsed.spectrum_type === 'xrd') {
    return {
      title: 'XRD Diffractogram',
      xAxis: '2θ (degrees)',
      yAxis: 'Intensity (counts)',
      xRange: parsed.quick_stats.xRange
    };
  }
  if (parsed.spectrum_type === 'uvvis') {
    return {
      title: 'UV-Vis Absorption Spectrum',
      xAxis: 'Wavelength (nm)',
      yAxis: 'Absorbance',
      xRange: parsed.quick_stats.xRange
    };
  }
  if (parsed.spectrum_type === 'raman') {
    return {
      title: 'Raman Spectrum',
      xAxis: 'Raman shift (cm⁻¹)',
      yAxis: 'Intensity (a.u.)',
      xRange: parsed.quick_stats.xRange
    };
  }
  if (parsed.spectrum_type === 'ftir') {
    return {
      title: 'FTIR Spectrum',
      xAxis: 'Wavenumber (cm⁻¹)',
      yAxis: parsed.y_mode === 'transmittance' ? 'Transmittance (%)' : 'Absorbance',
      xRange: parsed.quick_stats.xRange,
      reverseX: true
    };
  }
  // uvvis_drs or unknown — fallback
  return {
    title: 'Spectrum',
    xAxis: 'X',
    yAxis: 'Y',
    xRange: parsed.quick_stats.xRange
  };
}

export function SpectrumChart({ parsed, referenceCards = [] }: SpectrumChartProps) {
  // Defensive: missing curve data — uvvis_drs has reflectance_curve, not spectrum_curve
  if (parsed.spectrum_type === 'uvvis_drs') {
    return <div className='text-sm text-muted-foreground'>DRS rendered separately</div>;
  }
  if (!parsed.spectrum_curve?.x || !parsed.spectrum_curve.y) {
    return <div className='text-sm text-muted-foreground'>No spectrum data to display</div>;
  }
  let traces: PlotData[] = [];
  // Reference cards only apply to XRD
  const refCards = parsed.spectrum_type === 'xrd' ? referenceCards : [];
  if (parsed.spectrum_type === 'xrd') traces = getXRDTraces(parsed, refCards);
  else if (parsed.spectrum_type === 'uvvis') traces = getUVVisTraces(parsed);
  else if (parsed.spectrum_type === 'raman') traces = getRamanTraces(parsed);
  else if (parsed.spectrum_type === 'ftir') traces = getFTIRTraces(parsed);

  const cfg = getLayoutConfig(parsed);
  const xRange = cfg.reverseX ? (cfg.xRange.toReversed() as [number, number]) : cfg.xRange;

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true,
        height: 420,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: cfg.title, font: { size: 14 } },
        xaxis: {
          title: { text: cfg.xAxis },
          range: xRange,
          gridcolor: 'hsl(var(--border))'
        },
        yaxis: {
          title: { text: cfg.yAxis },
          gridcolor: 'hsl(var(--border))'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.2 },
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
