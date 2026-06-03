'use client';
/**
 * /dashboard/superadmin/evals — Ragas quality dashboard.
 * @phase R172-6
 */
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/use-auth';

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

interface RetrievalMetrics {
  n: number;
  chunkFound: number;
  paperFound: number;
  chunkRecall: Record<string, number>;
  paperRecall: Record<string, number>;
  chunkMRR: number;
  paperMRR: number;
  label?: string;
  runId?: string;
  timing?: {
    refit: boolean;
    prepMs: number;
    totalMs: number;
    searchLatencyMs: { min: number; median: number; p95: number; max: number };
    stepMedians?: Record<string, number>;
  };
}

/** On-demand retrieval golden-set eval (Contextual Retrieval A/B). */
function RetrievalEvalCard() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = React.useState('tenant-dev-001');
  const [label, setLabel] = React.useState('off');
  const [refit, setRefit] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<RetrievalMetrics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reindexing, setReindexing] = React.useState(false);
  const [reindexMsg, setReindexMsg] = React.useState<string | null>(null);

  async function runEval() {
    if (!user) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/superadmin/evals/retrieval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, label, refit })
      });
      const json = (await res.json()) as RetrievalMetrics & { error?: string };
      if (!res.ok || json.error) setError(json.error ?? `HTTP ${res.status}`);
      else setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request_failed');
    } finally {
      setRunning(false);
    }
  }

  async function runReindex() {
    if (!user) return;
    if (
      !window.confirm(
        `Re-index ALL indexed papers for "${tenantId}"?\n\n` +
          'This deletes + rebuilds every chunk and costs ~$0.12/paper of enrichment. ' +
          'Make sure ENABLE_ENRICHMENT=true is deployed on the worker FIRST. ' +
          'Processing runs async over several minutes.'
      )
    ) {
      return;
    }
    setReindexing(true);
    setReindexMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/superadmin/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId })
      });
      const json = (await res.json()) as { enqueued?: number; total?: number; error?: string };
      if (!res.ok || json.error) {
        setReindexMsg(`Error: ${json.error ?? `HTTP ${res.status}`}`);
      } else {
        setReindexMsg(
          `Enqueued ${json.enqueued}/${json.total} papers. Wait for all to reach "indexed", then Run eval with label "on".`
        );
      }
    } catch (e) {
      setReindexMsg(e instanceof Error ? e.message : 'request_failed');
    } finally {
      setReindexing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retrieval eval — Contextual Retrieval A/B</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='text-xs'>
            <span className='mb-1 block text-muted-foreground'>Tenant</span>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className='h-8 w-56'
            />
          </div>
          <div className='text-xs'>
            <span className='mb-1 block text-muted-foreground'>Label (e.g. off / on)</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className='h-8 w-32' />
          </div>
          <label className='flex items-center gap-1.5 text-xs'>
            <input
              type='checkbox'
              checked={refit}
              onChange={(e) => setRefit(e.target.checked)}
              aria-label='refit BM25 before eval'
              className='h-3.5 w-3.5'
            />
            refit BM25
          </label>
          <Button onClick={() => void runEval()} disabled={running || !user} className='h-8'>
            {running ? 'Running ~50 queries…' : 'Run eval'}
          </Button>
          <Button
            onClick={() => void runReindex()}
            disabled={reindexing || !user}
            variant='outline'
            className='h-8'
          >
            {reindexing ? 'Enqueuing…' : 'Re-index (enrichment)'}
          </Button>
        </div>

        {error && <p className='text-destructive text-sm'>Error: {error}</p>}
        {reindexMsg && <p className='text-muted-foreground text-sm'>{reindexMsg}</p>}

        {result && (
          <div className='space-y-2 text-xs'>
            <div className='text-muted-foreground'>
              run <span className='font-mono'>{result.label}</span> · n={result.n} · chunk found{' '}
              {result.chunkFound} · paper found {result.paperFound}
            </div>
            <table className='w-full max-w-md'>
              <thead>
                <tr className='text-muted-foreground text-left'>
                  <th className='p-1'>metric</th>
                  <th className='p-1 text-right'>@5</th>
                  <th className='p-1 text-right'>@10</th>
                  <th className='p-1 text-right'>@20</th>
                  <th className='p-1 text-right'>MRR</th>
                </tr>
              </thead>
              <tbody>
                <tr className='border-t'>
                  <td className='p-1'>chunk recall</td>
                  <td className='p-1 text-right font-mono'>{result.chunkRecall['@5']}</td>
                  <td className='p-1 text-right font-mono'>{result.chunkRecall['@10']}</td>
                  <td className='p-1 text-right font-mono'>{result.chunkRecall['@20']}</td>
                  <td className='p-1 text-right font-mono'>{result.chunkMRR}</td>
                </tr>
                <tr className='border-t'>
                  <td className='p-1'>paper recall</td>
                  <td className='p-1 text-right font-mono'>{result.paperRecall['@5']}</td>
                  <td className='p-1 text-right font-mono'>{result.paperRecall['@10']}</td>
                  <td className='p-1 text-right font-mono'>{result.paperRecall['@20']}</td>
                  <td className='p-1 text-right font-mono'>{result.paperMRR}</td>
                </tr>
              </tbody>
            </table>
            <p className='text-muted-foreground'>
              Saved as run <span className='font-mono'>{result.runId}</span>. After enabling
              enrichment + re-indexing, run again with label <span className='font-mono'>on</span>{' '}
              to compare.
            </p>
            {result.timing && (
              <p className='text-muted-foreground'>
                timing — prep {result.timing.prepMs}ms · search median{' '}
                {result.timing.searchLatencyMs.median}ms · p95 {result.timing.searchLatencyMs.p95}ms
                · max {result.timing.searchLatencyMs.max}ms · total {result.timing.totalMs}ms
                {result.timing.refit ? ' (refit)' : ''}
              </p>
            )}
            {result.timing?.stepMedians && (
              <p className='text-muted-foreground font-mono'>
                step medians (cumulative ms):{' '}
                {Object.entries(result.timing.stepMedians)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
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

      <RetrievalEvalCard />

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
