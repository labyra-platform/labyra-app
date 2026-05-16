'use client';
/**
 * /dashboard/superadmin/costs — cost overview dashboard.
 *
 * @phase R172-5
 */
import * as React from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { CostKpiCards } from '@/features/superadmin/components/cost-kpi-cards';
import { CostTimeseries } from '@/features/superadmin/components/cost-timeseries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CostApiRow {
  date: string;
  tenantId: string;
  totalCost: number;
  byTier: Record<string, { queries: number; cost: number }>;
  byFeature: Record<string, { queries: number; cost: number }>;
  byCapability: Record<string, { cost: number; queries?: number; latencyMsTotal?: number }>;
}

interface CostApiResponse {
  range: { startDate: string; endDate: string; days: number };
  summary: {
    totalCost: number;
    totalQueries: number;
    avgCostPerQuery: number;
    tenantCount: number;
    dayCount: number;
  };
  rows: CostApiRow[];
}

export default function CostsPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<CostApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/superadmin/costs?range=30', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CostApiResponse;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (loading) {
    return <div className='p-8 text-muted-foreground'>Loading costs...</div>;
  }
  if (error) {
    return <div className='p-8 text-destructive'>Error: {error}</div>;
  }
  if (!data) return null;

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>Cost Overview</h1>
        <p className='text-muted-foreground text-sm'>
          Last {data.range.days} days · {data.range.startDate} → {data.range.endDate}
        </p>
      </div>

      <CostKpiCards summary={data.summary} />

      <Card>
        <CardHeader>
          <CardTitle>Daily cost trend</CardTitle>
        </CardHeader>
        <CardContent>
          <CostTimeseries rows={data.rows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent days (raw)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-auto max-h-96'>
            <table className='text-xs w-full'>
              <thead className='sticky top-0 bg-background'>
                <tr className='text-left'>
                  <th className='p-2'>Date</th>
                  <th className='p-2'>Tenant</th>
                  <th className='p-2 text-right'>Total USD</th>
                  <th className='p-2 text-right'>Queries</th>
                </tr>
              </thead>
              <tbody>
                {data.rows
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 50)
                  .map((r, i) => {
                    const queries = Object.values(r.byTier).reduce((s, v) => s + v.queries, 0);
                    return (
                      <tr key={i} className='border-t'>
                        <td className='p-2 font-mono'>{r.date}</td>
                        <td className='p-2'>{r.tenantId}</td>
                        <td className='p-2 text-right font-mono'>${r.totalCost.toFixed(4)}</td>
                        <td className='p-2 text-right font-mono'>{queries}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
