'use client';
/**
 * /dashboard/superadmin/evals — Ragas quality dashboard.
 * @phase R172-6
 */
import * as React from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EvalSummary {
  tenantId: string;
  week: string;
  sampleSize?: number;
  flaggedCount?: number;
  evaluatorCostUsd?: number;
  [key: string]: unknown;
}

interface FlaggedConv {
  tenantId: string;
  week: string;
  conversationId: string;
  overallScore: number;
  flagReasons: string[];
}

interface EvalsResponse {
  summaries: EvalSummary[];
  flaggedConversations: FlaggedConv[];
}

export default function EvalsPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<EvalsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch('/api/superadmin/evals', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className='p-8 text-muted-foreground'>Loading evals...</div>;
  if (!data) return <div className='p-8'>No data</div>;

  return (
    <div className='space-y-6 p-6'>
      <h1 className='text-2xl font-bold'>Quality Evaluation (Ragas)</h1>

      <Card>
        <CardHeader>
          <CardTitle>Weekly summaries ({data.summaries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.summaries.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No eval data yet. First run: next Sunday 03:00 UTC.
            </p>
          ) : (
            <div className='overflow-auto'>
              <table className='text-xs w-full'>
                <thead>
                  <tr className='text-left'>
                    <th className='p-2'>Week</th>
                    <th className='p-2'>Tenant</th>
                    <th className='p-2 text-right'>Samples</th>
                    <th className='p-2 text-right'>Flagged</th>
                    <th className='p-2 text-right'>Cost USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summaries.map((s, i) => (
                    <tr key={i} className='border-t'>
                      <td className='p-2 font-mono'>{s.week}</td>
                      <td className='p-2'>{s.tenantId}</td>
                      <td className='p-2 text-right'>{s.sampleSize ?? 0}</td>
                      <td className='p-2 text-right'>{s.flaggedCount ?? 0}</td>
                      <td className='p-2 text-right font-mono'>
                        ${(s.evaluatorCostUsd ?? 0).toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flagged conversations ({data.flaggedConversations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.flaggedConversations.length === 0 ? (
            <p className='text-muted-foreground text-sm'>None flagged.</p>
          ) : (
            <ul className='space-y-2 text-xs'>
              {data.flaggedConversations.map((c, i) => (
                <li key={i} className='border-l-2 border-destructive pl-3'>
                  <div className='font-mono'>
                    {c.tenantId} · {c.week} · {c.conversationId}
                  </div>
                  <div className='text-muted-foreground'>
                    Score: {c.overallScore.toFixed(3)} · Flags: {c.flagReasons.join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
