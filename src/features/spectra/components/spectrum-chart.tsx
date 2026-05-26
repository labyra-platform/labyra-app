'use client';

/**
 * SpectrumChart — Plotly chart with full spectrum curve + peak markers.
 * Renders different chart configurations per spectrum type.
 * Appearance is driven by a FigureConfig (edited in the Figure Studio modal).
 * @phase R160-spectra-3c-hotfix · R206-figure-studio
 */

import dynamic from 'next/dynamic';

import {
  DEFAULT_LINE_COLOR,
  type FigureConfig,
  type LineStyle,
  type PeakLabelMode,
  type TraceDescriptor
} from '@/features/spectra/figure-config';
import type { FTIRPeak, SpectrumParsedData } from '@/types/spectra-analysis';
import { formatSciText } from '@/features/spectra/utils/format-units';

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

export interface ReferenceCardOverlay {
  id: string;
  cardNumber: string;
  phaseName: string;
  formula?: string;
  peaks: ReferenceCardPeakInput[];
  color: string; // hex/hsl for overlay
}

interface SpectrumChartProps {
  parsed: SpectrumParsedData;
  /** Appearance config. SpectrumChart is now controlled — the parent owns it. */
  config: FigureConfig;
  referenceCards?: ReferenceCardOverlay[];
}

interface PlotData {
  x: number[];
  y: number[];
  type: 'scatter';
  mode: 'lines' | 'markers' | 'lines+markers' | 'text+markers';
  name: string;
  line?: { color: string; width?: number; dash?: LineStyle };
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

const PEAK_COLOR = 'hsl(0, 70%, 55%)';

/**
 * Single-curve spectra (XRD/UV-Vis/Raman/FTIR) declare one trace. The label
 * follows the technique's Y quantity so the legend/panel reads naturally.
 */
export function getSpectrumTraceDescriptors(parsed: SpectrumParsedData): TraceDescriptor[] {
  const label =
    parsed.spectrum_type === 'xrd'
      ? 'Intensity'
      : parsed.spectrum_type === 'ftir'
        ? 'Transmittance'
        : parsed.spectrum_type === 'raman'
          ? 'Intensity'
          : 'Absorbance';
  return [{ id: 'main', label, defaultColor: DEFAULT_LINE_COLOR }];
}

// Build peak labels by mode. 'group' maps each peak to the nearest FTIR
// functional group (by wavenumber) so a peak can be labelled with its chemistry
// (e.g. "O-H stretch"); 'value' shows the x-position; others fall back to index.
function peakLabels(parsed: SpectrumParsedData, xs: number[], mode: PeakLabelMode): string[] {
  if (mode === 'none') return xs.map(() => '');
  if (mode === 'value') return xs.map((x) => `${Math.round(x)}`);
  if (mode === 'number') return xs.map((_x, i) => `${i + 1}`);
  // mode === 'group'
  if (parsed.spectrum_type === 'ftir' && parsed.functional_groups?.length) {
    const groups = parsed.functional_groups;
    return xs.map((x, i) => {
      let best: { name: string; d: number } | null = null;
      for (const g of groups) {
        for (const m of g.matched_peaks_cm1 ?? []) {
          const d = Math.abs(m - x);
          if (best === null || d < best.d) best = { name: g.name, d };
        }
      }
      // accept the match only if within 8 cm-1 of a matched peak
      return best && best.d <= 8 ? best.name : `${i + 1}`;
    });
  }
  return xs.map((_x, i) => `${i + 1}`);
}

function getXRDTraces(
  parsed: SpectrumParsedData,
  config: FigureConfig,
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
      line: {
        color: config.traces[0]?.color ?? '#1f4e9c',
        width: config.traces[0]?.lineWidth ?? 1.5,
        dash: config.traces[0]?.lineStyle ?? 'solid'
      }
    }
  ];
  if (config.showPeaks && (parsed.peaks?.length ?? 0) > 0) {
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.two_theta),
        config.peakLabel
      ),
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

function getUVVisTraces(parsed: SpectrumParsedData, config: FigureConfig): PlotData[] {
  if (parsed.spectrum_type !== 'uvvis') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Absorbance',
      line: {
        color: config.traces[0]?.color ?? '#1f4e9c',
        width: config.traces[0]?.lineWidth ?? 1.5,
        dash: config.traces[0]?.lineStyle ?? 'solid'
      }
    }
  ];
  if (config.showPeaks && (parsed.peaks?.length ?? 0) > 0) {
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.wavelength_nm),
        config.peakLabel
      ),
      textposition: 'top center',
      hovertemplate: '%{customdata}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p) => `λ = ${p.wavelength_nm.toFixed(2)} nm (${p.energy_ev.toFixed(2)} eV)`
      )
    });
  }
  return traces;
}

function getRamanTraces(parsed: SpectrumParsedData, config: FigureConfig): PlotData[] {
  if (parsed.spectrum_type !== 'raman') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Raman',
      line: {
        color: config.traces[0]?.color ?? '#1f4e9c',
        width: config.traces[0]?.lineWidth ?? 1.5,
        dash: config.traces[0]?.lineStyle ?? 'solid'
      }
    }
  ];
  if (config.showPeaks && (parsed.peaks?.length ?? 0) > 0) {
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.shift_cm1),
        config.peakLabel
      ),
      textposition: 'top center',
      hovertemplate: '%{customdata}<br>I = %{y:.1f}<extra></extra>',
      customdata: (parsed.peaks ?? []).map(
        (p) => `ν = ${p.shift_cm1.toFixed(1)} cm⁻¹, FWHM = ${p.fwhm.toFixed(1)}`
      )
    });
  }
  return traces;
}

function getFTIRTraces(parsed: SpectrumParsedData, config: FigureConfig): PlotData[] {
  if (parsed.spectrum_type !== 'ftir') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: parsed.y_mode === 'transmittance' ? 'Transmittance' : 'Absorbance',
      line: {
        color: config.traces[0]?.color ?? '#1f4e9c',
        width: config.traces[0]?.lineWidth ?? 1.5,
        dash: config.traces[0]?.lineStyle ?? 'solid'
      }
    }
  ];
  if (config.showPeaks && (parsed.peaks?.length ?? 0) > 0) {
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.wavenumber_cm1),
        config.peakLabel
      ),
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
    xRange: 'xRange' in parsed.quick_stats ? parsed.quick_stats.xRange : [0, 1]
  };
}

export function SpectrumChart({ parsed, config, referenceCards = [] }: SpectrumChartProps) {
  // Defensive: missing curve data — uvvis_drs has reflectance_curve, not spectrum_curve
  if (parsed.spectrum_type === 'uvvis_drs') {
    return <div className='text-sm text-muted-foreground'>DRS rendered separately</div>;
  }
  if (!('spectrum_curve' in parsed) || !parsed.spectrum_curve?.x || !parsed.spectrum_curve.y) {
    return <div className='text-sm text-muted-foreground'>No spectrum data to display</div>;
  }
  let traces: PlotData[] = [];
  // Reference cards only apply to XRD
  const refCards = parsed.spectrum_type === 'xrd' ? referenceCards : [];
  if (parsed.spectrum_type === 'xrd') traces = getXRDTraces(parsed, config, refCards);
  else if (parsed.spectrum_type === 'uvvis') traces = getUVVisTraces(parsed, config);
  else if (parsed.spectrum_type === 'raman') traces = getRamanTraces(parsed, config);
  else if (parsed.spectrum_type === 'ftir') traces = getFTIRTraces(parsed, config);

  const cfg = getLayoutConfig(parsed);
  // Axis range: config overrides (min/max) take precedence, else default, with
  // reverse applied last.
  const baseRange: [number, number] = [config.xMin ?? cfg.xRange[0], config.xMax ?? cfg.xRange[1]];
  const xRange = config.reverseX ? ([baseRange[1], baseRange[0]] as [number, number]) : baseRange;
  const yRange: [number, number] | undefined =
    config.yMin !== null && config.yMax !== null ? [config.yMin, config.yMax] : undefined;

  // react-plotly.js uses Plotly.react() for updates, which can keep a stale
  // layout (legend slot, axis domain) when only layout props change — the
  // preview looks wrong until the modal is reopened. Bumping `revision` on every
  // config change forces a full relayout; `datarevision` does the same for the
  // traces (colour/width/style/peaks). Cheap string identity over the config.
  const revision = JSON.stringify(config);
  // Toggles that change the plot AREA (legend slot, mirrored frame, grid, axis
  // direction) are the ones Plotly.react() handles unreliably — remount on those
  // only (not on text/number edits) so the preview is always correct without a
  // modal reopen. Cheap: this string changes a handful of times, not per char.
  const layoutKey = `${config.showLegend}-${config.closedFrame}-${config.showGrid}-${config.reverseX}`;

  return (
    <Plot
      key={layoutKey}
      data={traces}
      revision={revision.length}
      layout={{
        autosize: true,
        height: 420,
        datarevision: revision,
        margin: { l: 60, r: 30, t: 40, b: 50 },
        title: { text: formatSciText(config.figureTitle ?? cfg.title), font: { size: 14 } },
        xaxis: {
          title: { text: config.xTitle ?? cfg.xAxis },
          range: xRange,
          showgrid: config.showGrid,
          gridcolor: 'hsl(var(--border))',
          // Axis frame is independent of the grid: turning off the grid must
          // never remove the axis lines. mirror:true closes the top/right frame
          // (the boxed-axes convention for scientific figures); zeroline off so
          // the data line isn't dragged toward a spurious y=0 baseline.
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: config.closedFrame,
          zeroline: false,
          ticks: 'outside'
        },
        yaxis: {
          title: { text: config.yTitle ?? cfg.yAxis },
          range: yRange,
          showgrid: config.showGrid,
          gridcolor: 'hsl(var(--border))',
          showline: true,
          linecolor: 'hsl(var(--foreground))',
          linewidth: 1,
          mirror: config.closedFrame,
          zeroline: false,
          ticks: 'outside'
        },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', size: 12 },
        showlegend: config.showLegend,
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
