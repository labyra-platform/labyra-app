/**
 * DosPdosPanel — total DOS + element/orbital-projected DOS from /api/dft/dos.
 * Rotated (energy axis vertical) and sharing the band plot's energy window via
 * eMin/eMax so the two panels stay aligned under pan/zoom.
 *
 * @phase R291-dft-dos-zoom
 */
'use client';
import { useMemo } from 'react';
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export interface DosData {
  energies: number[];
  total: number[] | null;
  pdos: { label: string; dos: number[] }[];
  fermiEv: number | null;
  nPoints: number;
}

const PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d'
];

interface TipItem {
  dataKey?: string | number;
  value?: number;
  color?: string;
}
function DosTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const e = typeof label === 'number' ? label : 0;
  return (
    <div className='bg-popover rounded-md border px-2 py-1.5 text-xs shadow-md'>
      <div className='font-medium'>E = {e.toFixed(3)} eV</div>
      {payload
        .filter((p) => typeof p.value === 'number')
        .map((p) => (
          <div key={String(p.dataKey)} className='tabular-nums' style={{ color: p.color }}>
            {String(p.dataKey)}: {(p.value as number).toFixed(3)}
          </div>
        ))}
    </div>
  );
}

export function DosPdosPanel({
  data,
  zero,
  eMin,
  eMax
}: {
  data: DosData;
  zero: number;
  eMin: number;
  eMax: number;
}) {
  const { rows, labels } = useMemo(() => {
    const n = data.energies.length;
    const r: Record<string, number>[] = [];
    for (let i = 0; i < n; i++) {
      const e = data.energies[i] - zero;
      if (e < eMin || e > eMax) continue;
      const row: Record<string, number> = { e };
      if (data.total && data.total[i] !== undefined) row.total = data.total[i];
      for (const p of data.pdos) {
        if (p.dos[i] !== undefined) row[p.label] = p.dos[i];
      }
      r.push(row);
    }
    return { rows: r, labels: data.pdos.map((p) => p.label) };
  }, [data, zero, eMin, eMax]);

  return (
    <div className='flex h-full flex-col'>
      <div className='text-muted-foreground mb-2 flex h-6 items-center text-xs'>
        DOS / PDOS (states/eV)
      </div>
      <div className='relative min-h-0 flex-1'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart
            layout='vertical'
            data={rows}
            margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
          >
            <XAxis
              type='number'
              tick={{ fontSize: 10 }}
              stroke='currentColor'
              className='text-muted-foreground'
              tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
            />
            <YAxis
              type='number'
              dataKey='e'
              domain={[eMin, eMax]}
              reversed
              allowDataOverflow
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: 11 }}
              stroke='currentColor'
              className='text-muted-foreground'
              width={40}
            />
            <Tooltip content={<DosTooltip />} />
            <ReferenceLine y={0} strokeDasharray='4 4' stroke='currentColor' strokeOpacity={0.5} />
            {data.total ? (
              <Line
                dataKey='total'
                type='monotone'
                stroke='currentColor'
                className='text-foreground/40'
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            {labels.map((lab, i) => (
              <Line
                key={lab}
                dataKey={lab}
                type='monotone'
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className='pointer-events-none absolute top-1 right-2 flex flex-col gap-0.5 text-[10px]'>
          {data.total ? (
            <span className='flex items-center gap-1'>
              <span className='bg-foreground/40 inline-block size-2 rounded-[1px]' />
              total
            </span>
          ) : null}
          {labels.map((lab, i) => (
            <span key={lab} className='flex items-center gap-1'>
              <span
                className='inline-block size-2 rounded-[1px]'
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              {lab}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
