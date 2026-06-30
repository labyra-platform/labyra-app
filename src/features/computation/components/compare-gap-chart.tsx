/**
 * Compare chart — gap-vs-U calibration curve when exactly one Hubbard manifold
 * varies across the selected runs; otherwise a per-run bar chart of band gaps.
 * Only runs that actually have a gap are plotted.
 *
 * @phase R307-compare-runs
 */
'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { CompareRow } from '@/features/computation/compare-rows';
import { uOf, variedManifold } from '@/features/computation/compare-rows';

interface TipPayload {
  payload: { name: string; gap: number; u?: number };
}
function GapTooltip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className='bg-background rounded-md border px-2 py-1 text-xs shadow-sm'>
      <div className='font-medium'>{d.name}</div>
      {d.u != null ? <div className='text-muted-foreground tabular-nums'>U = {d.u} eV</div> : null}
      <div className='tabular-nums'>{d.gap.toFixed(3)} eV</div>
    </div>
  );
}

export function CompareGapChart({ rows }: { rows: CompareRow[] }) {
  const t = useTranslations('computation');
  const withGap = rows.filter((r) => r.gapEv != null);
  if (withGap.length === 0) {
    return (
      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
        {t('compareNoData')}
      </div>
    );
  }

  const vm = variedManifold(withGap);
  if (vm) {
    const data = withGap
      .map((r) => ({ u: uOf(r, vm), gap: r.gapEv as number, name: r.name }))
      .filter((d): d is { u: number; gap: number; name: string } => d.u != null)
      .toSorted((a, b) => a.u - b.u);
    return (
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
          <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
          <XAxis
            dataKey='u'
            type='number'
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 11 }}
            stroke='currentColor'
            className='text-muted-foreground'
            label={{
              value: t('compareUAxis', { manifold: vm }),
              position: 'insideBottom',
              offset: -8,
              style: { fontSize: 10 }
            }}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke='currentColor'
            className='text-muted-foreground'
            width={48}
            label={{
              value: t('compareGapAxis'),
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10 }
            }}
          />
          <Tooltip content={<GapTooltip />} />
          <Line
            dataKey='gap'
            type='monotone'
            stroke='#2563eb'
            strokeWidth={2}
            dot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const data = withGap.map((r) => ({ name: r.name, gap: r.gapEv as number }));
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 4 }}>
        <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
        <XAxis
          dataKey='name'
          tick={{ fontSize: 10 }}
          stroke='currentColor'
          className='text-muted-foreground'
          angle={-20}
          textAnchor='end'
          height={48}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke='currentColor'
          className='text-muted-foreground'
          width={48}
          label={{
            value: t('compareGapAxis'),
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 10 }
          }}
        />
        <Tooltip content={<GapTooltip />} />
        <Bar dataKey='gap' fill='#2563eb' />
      </BarChart>
    </ResponsiveContainer>
  );
}
