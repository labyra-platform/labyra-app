'use client';
/**
 * /dashboard/superadmin/drift — drift reconciliation dashboard.
 * @phase R172-6
 */
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

interface DriftReport {
  date: string;
  tenantId: string;
  estimated: { anthropic: number; google: number; total: number };
  actual: { anthropic: number; google: number };
  drift: { anthropic: number; google: number; reconciledTotal: number };
  alertTriggered: boolean;
  alertReasons: string[];
  notes?: string;
}

interface DriftResponse {
  range: { startDate: string; endDate: string; days: number };
  totalReports: number;
  totalAlerts: number;
  reports: DriftReport[];
  alerts: DriftReport[];
}

export default function DriftPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<DriftResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch('/api/superadmin/drift?range=14', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className='p-8 text-muted-foreground'>Loading drift reports...</div>;
  if (!data) return <div className='p-8'>No data</div>;

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>Cost Drift Detection</h1>
        <p className='text-muted-foreground text-sm'>
          Last {data.range.days} days · {data.totalReports} reports · {data.totalAlerts} alerts
        </p>
      </div>

      {data.totalAlerts > 0 && (
        <Card className='border-destructive'>
          <CardHeader>
            <CardTitle className='text-destructive'>Active alerts ({data.totalAlerts})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='space-y-2 text-xs'>
              {data.alerts.map((a, i) => (
                <li key={i} className='border-l-2 border-destructive pl-3'>
                  <div className='font-mono'>
                    {a.tenantId} · {a.date}
                  </div>
                  <div className='text-muted-foreground'>Reasons: {a.alertReasons.join(', ')}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          {data.reports.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No drift reports yet. First run: tomorrow 02:30 UTC.
            </p>
          ) : (
            <div className='overflow-auto'>
              <table className='text-xs w-full'>
                <thead>
                  <tr className='text-left'>
                    <th className='p-2'>Date</th>
                    <th className='p-2'>Tenant</th>
                    <th className='p-2 text-right'>Est Anthropic</th>
                    <th className='p-2 text-right'>Actual</th>
                    <th className='p-2 text-right'>Drift %</th>
                    <th className='p-2'>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((r, i) => (
                      <tr key={i} className='border-t'>
                        <td className='p-2 font-mono'>{r.date}</td>
                        <td className='p-2'>{r.tenantId}</td>
                        <td className='p-2 text-right font-mono'>
                          ${r.estimated.anthropic.toFixed(4)}
                        </td>
                        <td className='p-2 text-right font-mono'>
                          ${r.actual.anthropic.toFixed(4)}
                        </td>
                        <td className='p-2 text-right font-mono'>
                          {(r.drift.anthropic * 100).toFixed(1)}%
                        </td>
                        <td className='p-2'>{r.alertTriggered ? '⚠' : '✓'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
