'use client';
/**
 * 30-day cost time series — stacked area chart by tier.
 * @phase R172-7
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

interface CostRow {
  date: string;
  totalCost: number;
  byTier: Record<string, { queries: number; cost: number }>;
}

const TIER_COLORS: Record<string, string> = {
  '0': '#94a3b8',
  '1': '#60a5fa',
  '2': '#34d399',
  '3': '#fbbf24',
  '4': '#fb923c',
  '5': '#f87171'
};

export function CostTimeseries({ rows }: { rows: CostRow[] }) {
  // Aggregate by date (sum across tenants)
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const existing = byDate.get(r.date) ?? {
      date: r.date as unknown as number
    };
    for (const [tier, stats] of Object.entries(r.byTier)) {
      const key = `T${tier}`;
      existing[key] = ((existing[key] as number) ?? 0) + (stats.cost ?? 0);
    }
    byDate.set(r.date, existing);
  }

  const chartData = Array.from(byDate.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return (
      <div className='flex h-64 items-center justify-center text-muted-foreground text-sm'>
        No cost data in this range yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width='100%' height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
        <XAxis dataKey='date' fontSize={10} />
        <YAxis fontSize={10} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
        <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
        <Legend />
        {['T0', 'T1', 'T2', 'T3', 'T4', 'T5'].map((tier) => (
          <Area
            key={tier}
            type='monotone'
            dataKey={tier}
            stackId='1'
            stroke={TIER_COLORS[tier.slice(1)]}
            fill={TIER_COLORS[tier.slice(1)]}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
