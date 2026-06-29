/**
 * BandStructurePlot — interactive QE band structure from /api/dft/bands.
 *
 * Energy is relative to a zero reference (Fermi if known, else VBM). Features:
 *   • hover tooltip: k-position + the bands closest to the gap at that k
 *   • VBM/CBM markers at their k-points + shaded forbidden gap region
 *   • adaptive energy window so the CBM is always visible (wide-gap oxides)
 * 60 bands × 422 k-points → thin, dot-less, non-animated lines.
 *
 * @phase R289-dft-bands-interactive
 */
'use client';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
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

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
}
function BandTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const k = typeof label === 'number' ? label : 0;
  const near = payload
    .filter((p) => typeof p.value === 'number' && Math.abs(p.value as number) <= 2)
    .toSorted((a, b) => Math.abs(a.value as number) - Math.abs(b.value as number))
    .slice(0, 6);
  return (
    <div className='bg-popover rounded-md border px-2 py-1.5 text-xs shadow-md'>
      <div className='font-medium'>k = {k.toFixed(3)}</div>
      {near.length > 0 ? (
        near.map((p) => (
          <div key={String(p.dataKey)} className='text-muted-foreground tabular-nums'>
            {String(p.dataKey).replace('b', 'band ')}: {(p.value as number).toFixed(3)} eV
          </div>
        ))
      ) : (
        <div className='text-muted-foreground'>no bands within ±2 eV</div>
      )}
    </div>
  );
}

export function BandStructurePlot({ data }: { data: BandsData }) {
  const zero = data.fermiEv ?? data.gap?.vbm_ev ?? 0;
  const gap = data.gap;
  const windowEv = Math.max(5, (gap?.band_gap_ev ?? 0) + 2);

  const { rows, keptBandKeys } = useMemo(() => {
    const kept: number[] = [];
    for (let b = 0; b < data.bands.length; b++) {
      if (data.bands[b].some((e) => Math.abs(e - zero) <= windowEv)) kept.push(b);
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
  }, [data, zero, windowEv]);

  // Locate the VBM/CBM k-points by matching their energies in the grid.
  const extrema = useMemo(() => {
    if (!gap) return null;
    let vbmI = 0;
    let vbmDiff = Infinity;
    let cbmI = 0;
    let cbmDiff = Infinity;
    for (let b = 0; b < data.bands.length; b++) {
      const series = data.bands[b];
      for (let i = 0; i < series.length; i++) {
        const dv = Math.abs(series[i] - gap.vbm_ev);
        if (dv < vbmDiff) {
          vbmDiff = dv;
          vbmI = i;
        }
        const dc = Math.abs(series[i] - gap.cbm_ev);
        if (dc < cbmDiff) {
          cbmDiff = dc;
          cbmI = i;
        }
      }
    }
    return {
      vbm: { kdist: data.kdist[vbmI], y: gap.vbm_ev - zero },
      cbm: { kdist: data.kdist[cbmI], y: gap.cbm_ev - zero }
    };
  }, [data, gap, zero]);

  const zeroLabel = data.fermiEv != null ? 'E_F' : 'VBM';

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-2 flex flex-wrap items-center gap-2'>
        {gap ? (
          <span className='bg-primary/10 text-primary inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium'>
            E<sub>g</sub> = {gap.band_gap_ev.toFixed(2)} eV ({gap.direct ? 'direct' : 'indirect'})
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
              domain={[-windowEv, windowEv]}
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
            <Tooltip
              content={<BandTooltip />}
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }}
            />
            {/* shaded forbidden gap region (VBM=0 → CBM) */}
            {gap ? (
              <ReferenceArea
                y1={0}
                y2={gap.band_gap_ev}
                fill='currentColor'
                fillOpacity={0.06}
                className='text-primary'
              />
            ) : null}
            {/* high-symmetry verticals */}
            {data.ticks.map((tk, i) => (
              <ReferenceLine
                key={`tick-${i}`}
                x={tk.dist}
                stroke='currentColor'
                strokeOpacity={0.25}
              />
            ))}
            {/* VBM (zero) + CBM reference lines */}
            <ReferenceLine y={0} strokeDasharray='4 4' stroke='currentColor' strokeOpacity={0.5} />
            {gap ? (
              <ReferenceLine
                y={gap.band_gap_ev}
                strokeDasharray='4 4'
                stroke='currentColor'
                strokeOpacity={0.35}
              />
            ) : null}
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
            {/* VBM / CBM markers */}
            {extrema ? (
              <ReferenceDot
                x={extrema.vbm.kdist}
                y={extrema.vbm.y}
                r={4}
                fill='#2563eb'
                stroke='white'
                strokeWidth={1}
                label={{
                  value: 'VBM',
                  position: 'bottom',
                  style: { fontSize: 10, fill: '#2563eb' }
                }}
              />
            ) : null}
            {extrema ? (
              <ReferenceDot
                x={extrema.cbm.kdist}
                y={extrema.cbm.y}
                r={4}
                fill='#dc2626'
                stroke='white'
                strokeWidth={1}
                label={{ value: 'CBM', position: 'top', style: { fontSize: 10, fill: '#dc2626' } }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
