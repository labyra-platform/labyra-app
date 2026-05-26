'use client';

/**
 * TafelChart — a real Tafel plot (x = log10|j|, y = overpotential) with an
 * interactive Range Selector: drag-select a window on the kinetic branch and
 * the linear fit (Tafel slope) is computed INSTANTLY in the browser, no worker
 * round-trip. Falls back to the worker's auto-fit slope when no selection.
 *
 * Client-side fit is safe here because the worker already returns the processed
 * (log|j|, eta) curve — we only run an ordinary least-squares line over points
 * the user picked; we never re-derive the RHE/current-density chain.
 * @phase R214 (Tafel plot + Range Selector)
 */

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { type FigureConfig } from '@/features/spectra/figure-config';
import type { TafelParsedData } from '@/types/spectra-analysis-echem';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className='flex h-96 items-center justify-center text-sm text-muted-foreground'>
      Loading chart…
    </div>
  )
});

const PRIMARY = '#1f4e9c';
const FIT = '#16a34a';

interface FitResult {
  slopeMvPerDec: number;
  slopeVPerDec: number; // signed, for drawing the line
  intercept: number;
  rSquared: number;
  xLo: number;
  xHi: number;
  n: number;
}

/** Ordinary least-squares line y = a + b·x over the selected window. */
function linearFit(xs: number[], ys: number[]): Omit<FitResult, 'xLo' | 'xHi'> | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    sst += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx; // V per decade (signed)
  const a = my - b * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const yhat = a + b * xs[i];
    ssr += (ys[i] - yhat) ** 2;
  }
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  return {
    slopeMvPerDec: Math.abs(b) * 1000,
    slopeVPerDec: b,
    intercept: a,
    rSquared: r2,
    n
  };
}

export function TafelChart({ parsed, config }: { parsed: TafelParsedData; config?: FigureConfig }) {
  const curve = parsed.tafel_curve;
  const [range, setRange] = useState<[number, number] | null>(null);

  // Recompute the fit whenever the selected window changes.
  const fit = useMemo<FitResult | null>(() => {
    if (!curve || !range) return null;
    const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < curve.x.length; i++) {
      if (curve.x[i] >= lo && curve.x[i] <= hi) {
        xs.push(curve.x[i]);
        ys.push(curve.y[i]);
      }
    }
    const r = linearFit(xs, ys);
    return r ? { ...r, xLo: lo, xHi: hi } : null;
  }, [curve, range]);

  // No processed Tafel curve (missing RHE/reaction): tell the user what to do.
  if (!curve || curve.x.length === 0) {
    return (
      <div className='flex h-80 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
        <p>No Tafel curve available.</p>
        <p className='text-xs'>
          Use “Re-analyze” to set reaction (HER/OER), reference electrode and pH — the overpotential
          vs log|j| axes need them.
        </p>
      </div>
    );
  }

  const showLegend = config?.showLegend ?? true;
  const traces: Array<Record<string, unknown>> = [
    {
      x: curve.x,
      y: curve.y,
      type: 'scatter',
      mode: 'markers',
      name: 'η vs log|j|',
      marker: { color: config?.traces[0]?.color ?? PRIMARY, size: 5 }
    }
  ];

  // Overlay the fitted line across the selected window.
  if (fit) {
    traces.push({
      x: [fit.xLo, fit.xHi],
      y: [fit.intercept + fit.slopeVPerDec * fit.xLo, fit.intercept + fit.slopeVPerDec * fit.xHi],
      type: 'scatter',
      mode: 'lines',
      name: `Fit: ${fit.slopeMvPerDec.toFixed(1)} mV/dec`,
      line: { color: FIT, width: 2.5 }
    });
  }

  const autoSlope = parsed.analysis.tafel_slope_mV_per_dec;

  return (
    <div className='space-y-2'>
      <Plot
        data={traces}
        layout={{
          autosize: true,
          height: 400,
          margin: { l: 64, r: 30, t: 36, b: 52 },
          dragmode: 'select',
          selectdirection: 'h',
          title: { text: config?.figureTitle ?? 'Tafel plot', font: { size: 14 } },
          xaxis: {
            title: { text: config?.xTitle ?? 'log₁₀|j| (mA/cm²)' },
            gridcolor: 'hsl(var(--border))',
            showline: true,
            linecolor: 'hsl(var(--foreground))',
            zeroline: false,
            ticks: 'outside'
          },
          yaxis: {
            title: { text: config?.yTitle ?? 'Overpotential η (V)' },
            gridcolor: 'hsl(var(--border))',
            showline: true,
            linecolor: 'hsl(var(--foreground))',
            zeroline: false,
            ticks: 'outside'
          },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { family: 'inherit', size: 12 },
          showlegend: showLegend,
          legend: { orientation: 'h', y: -0.2 }
        }}
        config={{ displaylogo: false, responsive: true, displayModeBar: true }}
        onSelected={(e: { range?: { x?: number[] } } | undefined) => {
          const xr = e?.range?.x;
          if (xr && xr.length === 2) setRange([xr[0], xr[1]]);
        }}
        onDeselect={() => setRange(null)}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
      <div className='flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm'>
        {fit ? (
          <span className='tabular-nums'>
            Selected fit: <strong>{fit.slopeMvPerDec.toFixed(1)} mV/dec</strong> · R²{' '}
            {fit.rSquared.toFixed(4)} · {fit.n} pts
          </span>
        ) : (
          <span className='text-muted-foreground'>
            Drag-select a linear region to fit. Auto:{' '}
            <strong>{autoSlope != null ? `${autoSlope.toFixed(1)} mV/dec` : '—'}</strong>
          </span>
        )}
        {fit ? (
          <Button variant='ghost' size='sm' onClick={() => setRange(null)}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
