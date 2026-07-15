'use client';
/**
 * KPI cards for cost dashboard.
 * @phase R172-7
 */
import { Panel } from '@/components/ui-extra/panel';

interface CostSummary {
  totalCost: number;
  totalQueries: number;
  avgCostPerQuery: number;
  tenantCount: number;
  dayCount: number;
}

export function CostKpiCards({ summary }: { summary: CostSummary }) {
  const projectedMonthly = summary.dayCount > 0 ? (summary.totalCost / summary.dayCount) * 30 : 0;

  const cards = [
    {
      title: 'Total cost (period)',
      value: `$${summary.totalCost.toFixed(2)}`,
      hint: `${summary.dayCount} days · ${summary.tenantCount} tenants`
    },
    {
      title: 'Total queries',
      value: summary.totalQueries.toLocaleString(),
      hint: `Avg ${summary.totalQueries > 0 ? (summary.totalQueries / Math.max(summary.dayCount, 1)).toFixed(0) : 0}/day`
    },
    {
      title: 'Avg cost/query',
      value: `$${summary.avgCostPerQuery.toFixed(4)}`,
      hint: 'Across all tiers + features'
    },
    {
      title: 'Projected monthly',
      value: `$${projectedMonthly.toFixed(2)}`,
      hint: 'Linear extrapolation'
    }
  ];

  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {cards.map((c, i) => (
        <Panel key={i} title={c.title}>
          <p className='text-stat font-medium tabular-nums'>{c.value}</p>
          <p className='text-muted-foreground text-caption'>{c.hint}</p>
        </Panel>
      ))}
    </div>
  );
}
