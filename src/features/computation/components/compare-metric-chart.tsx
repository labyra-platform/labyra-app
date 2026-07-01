/**
 * Compare chart — the selected metric (gap / lattice a,c / volume / density /
 * energy) vs Hubbard U when exactly one manifold varies across the chosen runs;
 * otherwise a per-run bar chart. Only runs that have the metric are plotted.
 *
 * @phase R309-compare-metric
 */
'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { CompareMetric, CompareRow } from '@/features/computation/compare-rows';
import { metricMeta, metricValue, uOf, variedManifold } from '@/features/computation/compare-rows';

interface TipPayload {
  payload: { name: string; val: number; u?: number };
}

function makeTooltip(unit: string, decimals: number) {
  return function MetricTooltip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className='bg-background rounded-md border px-2 py-1 text-xs shadow-sm'>
        <div className='font-medium'>{d.name}</div>
        {d.u != null ? (
          <div className='text-muted-foreground tabular-nums'>U = {d.u} eV</div>
        ) : null}
        <div className='tabular-nums'>
          {d.val.toFixed(decimals)} {unit}
        </div>
      </div>
    );
  };
}

export function CompareMetricChart({
  rows,
  metric,
  target
}: {
  rows: CompareRow[];
  metric: CompareMetric;
  target?: number | null;
}) {
  const t = useTranslations('computation');
  const meta = metricMeta(metric);
  const axisLabel = `${t(meta.labelKey)} (${meta.unit})`;
  const Tip = makeTooltip(meta.unit, meta.decimals);
  const targetLine =
    target != null && Number.isFinite(target) ? (
      <ReferenceLine
        y={target}
        stroke='#dc2626'
        strokeDasharray='4 2'
        label={{
          value: `${t('compareTarget')} ${target} ${meta.unit}`,
          position: 'insideTopRight',
          fill: '#dc2626',
          fontSize: 10
        }}
      />
    ) : null;

  const withVal = rows
    .map((r) => ({ row: r, val: metricValue(r, metric) }))
    .filter((x): x is { row: CompareRow; val: number } => x.val != null);

  if (withVal.length === 0) {
    return (
      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
        {t('compareNoData')}
      </div>
    );
  }

  const vm = variedManifold(withVal.map((x) => x.row));
  if (vm) {
    const data = withVal
      .map((x) => ({ u: uOf(x.row, vm), val: x.val, name: x.row.name }))
      .filter((d): d is { u: number; val: number; name: string } => d.u != null)
      .toSorted((a, b) => a.u - b.u);
    return (
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
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
            width={56}
            domain={['auto', 'auto']}
            label={{
              value: axisLabel,
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10 }
            }}
          />
          <Tooltip content={<Tip />} />
          <Line
            dataKey='val'
            type='monotone'
            stroke='#2563eb'
            strokeWidth={2}
            dot={{ r: 4 }}
            isAnimationActive={false}
          />
          {targetLine}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const data = withVal.map((x) => ({ name: x.row.name, val: x.val }));
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
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
          width={56}
          domain={['auto', 'auto']}
          label={{ value: axisLabel, angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
        />
        <Tooltip content={<Tip />} />
        <Bar dataKey='val' fill='#2563eb' />
        {targetLine}
      </BarChart>
    </ResponsiveContainer>
  );
}
