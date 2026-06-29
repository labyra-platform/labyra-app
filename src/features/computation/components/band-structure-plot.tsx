/**
 * BandStructurePlot — render QE band structure from /api/dft/bands.
 *
 * Energy is plotted relative to a zero reference: the Fermi level when known,
 * else the VBM (standard for semiconductors). Bands outside a ±window around
 * zero are dropped so the gap region is legible. 60 bands × 422 k-points is a
 * lot of points, so lines are thin, dot-less, and non-animated.
 *
 * @phase R288-dft-bands-ui
 */
'use client';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts';

export interface BandGap {
  vbm_ev: number;
  cbm_ev: number;
  band_gap_ev: number;
  direct: boolean;
}
export interface BandsData {
  kdist: number[];
  bands: number[][];
  ticks: { dist: number; label: string }[];
  nbnd: number;
  nk: number;
  fermiEv: number | null;
  gap: BandGap | null;
}

const WINDOW_EV = 5; // show ±5 eV around the zero reference

export function BandStructurePlot({ data }: { data: BandsData }) {
  const zero = data.fermiEv ?? data.gap?.vbm_ev ?? 0;

  // Pivot to per-k rows: { k, b0, b1, ... }; keep only bands that enter the window.
  const { rows, keptBandKeys } = useMemo(() => {
    const kept: number[] = [];
    for (let b = 0; b < data.bands.length; b++) {
      const series = data.bands[b];
      const inWindow = series.some((e) => Math.abs(e - zero) <= WINDOW_EV);
      if (inWindow) kept.push(b);
    }
    const r = data.kdist.map((k, i) => {
      const row: Record<string, number> = { k };
      for (const b of kept) {
        const v = data.bands[b][i];
        if (v !== undefined) row[`b${b}`] = v - zero;
      }
      return row;
    });
    return { rows: r, keptBandKeys: kept.map((b) => `b${b}`) };
  }, [data, zero]);

  const gap = data.gap;
  const zeroLabel = data.fermiEv != null ? 'E_F' : 'VBM';

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-2 flex flex-wrap items-center gap-2'>
        {gap ? (
          <span className='inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
            E<sub>g</sub>= {gap.band_gap_ev.toFixed(2)} eV ({gap.direct ? 'direct' : 'indirect'})
          </span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {data.nbnd} bands · {data.nk} k-points · zero = {zeroLabel}
        </span>
      </div>
      <div className='min-h-0 flex-1'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray='3 3' className='stroke-border' vertical={false} />
            <XAxis
              dataKey='k'
              type='number'
              domain={['dataMin', 'dataMax']}
              ticks={data.ticks.map((tk) => tk.dist)}
              tickFormatter={(v: number) =>
                data.ticks.find((tk) => Math.abs(tk.dist - v) < 1e-6)?.label ?? ''
              }
              tick={{ fontSize: 12 }}
              stroke='currentColor'
              className='text-muted-foreground'
            />
            <YAxis
              domain={[-WINDOW_EV, WINDOW_EV]}
              tick={{ fontSize: 11 }}
              stroke='currentColor'
              className='text-muted-foreground'
              label={{
                value: 'E − E_ref (eV)',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, textAnchor: 'middle' }
              }}
              width={56}
            />
            {/* high-symmetry verticals */}
            {data.ticks.map((tk, i) => (
              <ReferenceLine
                key={`tick-${i}`}
                x={tk.dist}
                stroke='currentColor'
                strokeOpacity={0.25}
              />
            ))}
            {/* zero reference (Fermi / VBM) */}
            <ReferenceLine y={0} strokeDasharray='4 4' stroke='currentColor' strokeOpacity={0.5} />
            {keptBandKeys.map((key) => (
              <Line
                key={key}
                type='monotone'
                dataKey={key}
                stroke='currentColor'
                className='text-foreground/60'
                strokeWidth={0.8}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
