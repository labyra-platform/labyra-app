'use client';
// R165-phase-1-oxlint: oxlint cleanup

/**
 * SpectrumChart — Plotly chart with full spectrum curve + peak markers.
 * Renders different chart configurations per spectrum type.
 * @phase R160-spectra-3c-hotfix · R202-customize (plot options)
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FTIRPeak, SpectrumParsedData } from '@/types/spectra-analysis';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

// R202-customize: user-adjustable plot appearance (local UI state, no backend).
type PeakLabelMode = 'none' | 'number' | 'group';

interface PlotOptions {
  lineColor: string;
  lineWidth: number;
  reverseX: boolean;
  showGrid: boolean;
  showLegend: boolean;
  peakLabel: PeakLabelMode;
}

const LINE_COLOR_CHOICES = [
  'hsl(220, 70%, 50%)', // blue (default)
  'hsl(0, 0%, 20%)', // near-black (print)
  'hsl(0, 70%, 50%)', // red
  'hsl(150, 60%, 38%)', // green
  'hsl(28, 80%, 52%)' // orange
];

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

// R202-customize: build peak labels by mode. 'group' maps each peak to the
// nearest FTIR functional group (by wavenumber) so a peak can be labelled with
// its chemistry (e.g. "O-H stretch") instead of an index; other techniques and
// unmatched peaks fall back to the index number.
function peakLabels(parsed: SpectrumParsedData, xs: number[], mode: PeakLabelMode): string[] {
  if (mode === 'none') return xs.map(() => '');
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
  opts: PlotOptions,
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
      line: { color: opts.lineColor, width: opts.lineWidth }
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.two_theta),
        opts.peakLabel
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

function getUVVisTraces(parsed: SpectrumParsedData, opts: PlotOptions): PlotData[] {
  if (parsed.spectrum_type !== 'uvvis') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Absorbance',
      line: { color: opts.lineColor, width: opts.lineWidth }
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.wavelength_nm),
        opts.peakLabel
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

function getRamanTraces(parsed: SpectrumParsedData, opts: PlotOptions): PlotData[] {
  if (parsed.spectrum_type !== 'raman') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Raman',
      line: { color: opts.lineColor, width: opts.lineWidth }
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.shift_cm1),
        opts.peakLabel
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

function getFTIRTraces(parsed: SpectrumParsedData, opts: PlotOptions): PlotData[] {
  if (parsed.spectrum_type !== 'ftir') return [];
  const traces: PlotData[] = [
    {
      x: parsed.spectrum_curve.x,
      y: parsed.spectrum_curve.y,
      type: 'scatter',
      mode: 'lines',
      name: parsed.y_mode === 'transmittance' ? 'Transmittance' : 'Absorbance',
      line: { color: opts.lineColor, width: opts.lineWidth }
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
      text: peakLabels(
        parsed,
        (parsed.peaks ?? []).map((p) => p.wavenumber_cm1),
        opts.peakLabel
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
    xRange: parsed.quick_stats.xRange
  };
}

export function SpectrumChart({ parsed, referenceCards = [] }: SpectrumChartProps) {
  // R202-customize: plot options state. Must be declared before any early
  // return to satisfy the React Rules of Hooks.
  const cfgDefaults = useMemo(() => getLayoutConfig(parsed), [parsed]);
  const [opts, setOpts] = useState<PlotOptions>({
    lineColor: LINE_COLOR,
    lineWidth: 1.5,
    reverseX: cfgDefaults.reverseX ?? false,
    showGrid: true,
    showLegend: true,
    peakLabel: 'number'
  });

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
  if (parsed.spectrum_type === 'xrd') traces = getXRDTraces(parsed, opts, refCards);
  else if (parsed.spectrum_type === 'uvvis') traces = getUVVisTraces(parsed, opts);
  else if (parsed.spectrum_type === 'raman') traces = getRamanTraces(parsed, opts);
  else if (parsed.spectrum_type === 'ftir') traces = getFTIRTraces(parsed, opts);

  const cfg = cfgDefaults;
  const xRange = opts.reverseX ? (cfg.xRange.toReversed() as [number, number]) : cfg.xRange;
  // FTIR functional-group labels are only available for FTIR data.
  const canLabelGroups = parsed.spectrum_type === 'ftir';

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-end'>
        <PlotCustomizePanel opts={opts} onChange={setOpts} canLabelGroups={canLabelGroups} />
      </div>
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
            showgrid: opts.showGrid,
            gridcolor: 'hsl(var(--border))'
          },
          yaxis: {
            title: { text: cfg.yAxis },
            showgrid: opts.showGrid,
            gridcolor: 'hsl(var(--border))'
          },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { family: 'inherit', size: 12 },
          showlegend: opts.showLegend,
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
    </div>
  );
}

interface PlotCustomizePanelProps {
  opts: PlotOptions;
  onChange: (next: PlotOptions) => void;
  canLabelGroups: boolean;
}

function PlotCustomizePanel({ opts, onChange, canLabelGroups }: PlotCustomizePanelProps) {
  const set = <K extends keyof PlotOptions>(key: K, value: PlotOptions[K]) =>
    onChange({ ...opts, [key]: value });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type='button' variant='outline' size='sm'>
          <Icons.adjustments className='mr-1.5 size-4' />
          Customize plot
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 space-y-4'>
        <div className='space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Line color</Label>
          <div className='flex gap-2'>
            {LINE_COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type='button'
                aria-label={`Line color ${c}`}
                onClick={() => set('lineColor', c)}
                className='size-6 rounded-full border-2 transition'
                style={{
                  backgroundColor: c,
                  borderColor: opts.lineColor === c ? 'hsl(var(--ring))' : 'transparent'
                }}
              />
            ))}
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>
            Line width ({opts.lineWidth.toFixed(1)})
          </Label>
          <Slider
            min={0.5}
            max={3}
            step={0.5}
            value={[opts.lineWidth]}
            onValueChange={(v) => set('lineWidth', v[0] ?? 1.5)}
          />
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs text-muted-foreground'>Peak labels</Label>
          <ToggleGroup
            type='single'
            value={opts.peakLabel}
            onValueChange={(v) => v && set('peakLabel', v as PeakLabelMode)}
            className='justify-start'
          >
            <ToggleGroupItem value='none' size='sm'>
              Off
            </ToggleGroupItem>
            <ToggleGroupItem value='number' size='sm'>
              1, 2, 3
            </ToggleGroupItem>
            {canLabelGroups && (
              <ToggleGroupItem value='group' size='sm'>
                Groups
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>

        <div className='flex items-center justify-between'>
          <Label htmlFor='reverse-x' className='text-xs text-muted-foreground'>
            Reverse X axis
          </Label>
          <Switch
            id='reverse-x'
            checked={opts.reverseX}
            onCheckedChange={(v) => set('reverseX', v)}
          />
        </div>
        <div className='flex items-center justify-between'>
          <Label htmlFor='show-grid' className='text-xs text-muted-foreground'>
            Grid
          </Label>
          <Switch
            id='show-grid'
            checked={opts.showGrid}
            onCheckedChange={(v) => set('showGrid', v)}
          />
        </div>
        <div className='flex items-center justify-between'>
          <Label htmlFor='show-legend' className='text-xs text-muted-foreground'>
            Legend
          </Label>
          <Switch
            id='show-legend'
            checked={opts.showLegend}
            onCheckedChange={(v) => set('showLegend', v)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
