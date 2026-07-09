/**
 * DftConvergenceTab — SCF + ionic-relaxation convergence charts for a workflow.
 *   • SCF accuracy per SCF step (log Y) — is each SCF cycle converging?
 *   • Energy + |force| per ionic step (dual axis, force log) — is the geometry
 *     relaxing to a minimum (energy plateau, force → 0)?
 * Fetches /api/dft/convergence. @phase R298
 */
'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatDuration } from '@/features/computation/workflow-row';
import { Button } from '@/components/ui/button';
import { exportPng, exportSvg } from '@/features/computation/components/chart-export';
import type { DftWorkflow } from '@/types/dft';

interface IonicStep {
  energy_ry: number;
  total_force: number;
}
interface ConvergenceData {
  calcType?: string;
  scf_accuracy: number[];
  /** 'total cpu time spent up to now' at each SCF iteration (s) — the time axis. */
  scf_seconds?: number[];
  /** false while the .out is a mid-run snapshot (live), true once QE printed JOB DONE. */
  job_done?: boolean;
  /** true when the .out is not in GCS yet (job queued / before first flush). */
  pending?: boolean;
  ionic_steps: IonicStep[];
  n_ionic_steps: number;
  converged: boolean;
  bfgs_steps: number | null;
  final_force: number | null;
  final_scf_accuracy: number | null;
  /** Total QE wall-clock seconds (compute time) from the unit's .out footer. */
  wallSeconds?: number | null;
}

interface TipItem {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
}
function ConvTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const dt = payload.find((p) => p.dataKey === 'acc') as
    | (TipItem & { payload?: { dt?: number } })
    | undefined;
  const dtVal = dt?.payload?.dt;
  return (
    <div className='bg-popover rounded-md border px-2 py-1.5 text-xs shadow-md'>
      <div className='font-medium'>
        iteration {label}
        {typeof dtVal === 'number' && dtVal > 0 ? ` · +${dtVal.toFixed(1)}s` : ''}
      </div>
      {payload.map((p) => {
        const v = p.value;
        const txt =
          typeof v === 'number'
            ? Math.abs(v) > 0 && Math.abs(v) < 0.01
              ? v.toExponential(2)
              : v.toFixed(4)
            : String(v);
        return (
          <div key={String(p.dataKey)} className='tabular-nums' style={{ color: p.color }}>
            {p.name ?? String(p.dataKey)}: {txt}
          </div>
        );
      })}
    </div>
  );
}

function downloadConvergenceCsv(data: ConvergenceData) {
  const lines = ['iteration,scf_accuracy_ry,cpu_seconds'];
  data.scf_accuracy.forEach((acc, i) => {
    lines.push(`${i + 1},${acc},${data.scf_seconds?.[i] ?? ''}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'convergence-scf.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function DftConvergenceTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const [data, setData] = useState<ConvergenceData | null>(null);
  const dataRef = useRef<ConvergenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!dataRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dft/convergence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: workflow.id })
      });
      const body = (await res.json().catch(() => ({}))) as ConvergenceData & { error?: string };
      if (!res.ok) {
        setError(body.error ?? t('convError'));
        return;
      }
      setData(body);
      dataRef.current = body;
    } catch {
      setError(t('convError'));
    } finally {
      setLoading(false);
    }
  }, [workflow.id, t]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load();
      if (stop) return;
      // keep polling every 8s while the run is still streaming (no JOB DONE yet)
      if (!dataRef.current?.job_done) timer = setTimeout(() => void tick(), 8000);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id]);

  if (loading) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('convLoading')}</div>
    );
  }
  if (error) {
    return <div className='text-destructive py-12 text-center text-sm'>{error}</div>;
  }
  if (!data) return null;

  // Job launched but no output yet (still queued, or before the first 30 s
  // streaming flush) — show a waiting state; the poller keeps checking.
  if (data.pending && data.scf_accuracy.length === 0) {
    return (
      <div className='text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm'>
        <span className='inline-flex items-center gap-1.5'>
          <span className='size-1.5 animate-pulse rounded-full bg-blue-500' />
          {t('convWaiting')}
        </span>
        <span className='text-xs'>{t('convWaitingHint')}</span>
      </div>
    );
  }

  const secs = data.scf_seconds ?? [];
  const exportChart = (fmt: 'svg' | 'png') => {
    const svg = chartRef.current?.querySelector('svg');
    if (!svg) return;
    if (fmt === 'svg') exportSvg(svg as unknown as SVGSVGElement, 'convergence-scf.svg');
    else void exportPng(svg as unknown as SVGSVGElement, 'convergence-scf.png', 2);
  };
  const scfRows = data.scf_accuracy.map((a, i) => ({
    step: i + 1,
    acc: a,
    dt: i > 0 && secs[i] != null && secs[i - 1] != null ? secs[i] - secs[i - 1] : 0
  }));
  // Convergence targets from the unit whose data the endpoint returned (calcType).
  // etot/forc default to the template values when the compose left them unset.
  const calcType = data.calcType;
  const convUnit = (workflow.units ?? []).find((u) => u.calcType === calcType);
  const cp = (convUnit?.params ?? {}) as {
    convThr?: number;
    etotConvThr?: number;
    forcConvThr?: number;
  };
  const scfThr = typeof cp.convThr === 'number' && cp.convThr > 0 ? cp.convThr : null;
  const etotThr = typeof cp.etotConvThr === 'number' && cp.etotConvThr > 0 ? cp.etotConvThr : 1e-6;
  const forcThr =
    typeof cp.forcConvThr === 'number' && cp.forcConvThr > 0 ? cp.forcConvThr : 4.5e-4;
  const isRelaxConv = calcType === 'relax' || calcType === 'vc-relax';

  const ionicRows = data.ionic_steps.map((s, i, arr) => ({
    step: i + 1,
    energy: s.energy_ry,
    force: s.total_force,
    // |ΔE| vs previous ionic step — the quantity etot_conv_thr actually bounds.
    dE: i > 0 ? Math.abs(s.energy_ry - arr[i - 1].energy_ry) : null
  }));
  const hasIonic = ionicRows.length > 1;

  return (
    <div className='mx-auto max-w-3xl space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <span
          className={
            data.converged
              ? 'rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600'
              : 'rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600'
          }
        >
          {data.converged ? t('converged') : t('notConverged')}
        </span>
        {!data.job_done ? (
          <span className='inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600'>
            <span className='size-1.5 animate-pulse rounded-full bg-blue-500' />
            {t('convLive')}
          </span>
        ) : null}
        {data.calcType ? (
          <span className='text-muted-foreground text-xs'>{data.calcType}</span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {t('ionicStepsLabel', { n: data.n_ionic_steps })}
          {data.bfgs_steps != null ? ` · ${t('bfgsLabel', { n: data.bfgs_steps })}` : ''}
        </span>
        {formatDuration(data.wallSeconds) ? (
          <span className='text-muted-foreground text-xs'>
            {t('computeTime')} {formatDuration(data.wallSeconds)}
          </span>
        ) : null}
      </div>

      {scfRows.length > 0 ? (
        <div>
          <div className='mb-1 flex items-center justify-between'>
            <p className='text-muted-foreground text-xs'>{t('scfAccuracyTitle')}</p>
            <div className='flex items-center gap-1.5'>
              <Button
                variant='outline'
                size='sm'
                className='h-6 px-2 text-xs'
                onClick={() => exportChart('svg')}
              >
                SVG
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='h-6 px-2 text-xs'
                onClick={() => exportChart('png')}
              >
                PNG
              </Button>
              <Button
                variant='outline'
                size='sm'
                className='h-6 px-2 text-xs'
                onClick={() => downloadConvergenceCsv(data)}
              >
                CSV
              </Button>
            </div>
          </div>
          <div ref={chartRef} className='h-48'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={scfRows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                <XAxis
                  dataKey='step'
                  type='number'
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 11 }}
                  stroke='currentColor'
                  className='text-muted-foreground'
                  label={{
                    value: t('scfStep'),
                    position: 'insideBottom',
                    offset: -6,
                    style: { fontSize: 10 }
                  }}
                />
                <YAxis
                  scale='log'
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  stroke='currentColor'
                  className='text-muted-foreground'
                  tickFormatter={(v: number) => v.toExponential(0)}
                  width={56}
                />
                <Tooltip content={<ConvTooltip />} />
                {scfThr ? (
                  <ReferenceLine
                    y={scfThr}
                    stroke='#2563eb'
                    strokeDasharray='4 4'
                    strokeOpacity={0.6}
                    label={{
                      value: `conv_thr ${scfThr.toExponential(0)}`,
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: '#2563eb'
                    }}
                  />
                ) : null}
                <Line
                  dataKey='acc'
                  name={t('scfAccuracyShort')}
                  type='monotone'
                  stroke='#2563eb'
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {hasIonic ? (
        <div>
          <p className='text-muted-foreground mb-1 text-xs'>{t('ionicTitle')}</p>
          <div className='h-48'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={ionicRows} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
                <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
                <XAxis
                  dataKey='step'
                  type='number'
                  domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 11 }}
                  stroke='currentColor'
                  className='text-muted-foreground'
                  label={{
                    value: t('ionicStep'),
                    position: 'insideBottom',
                    offset: -6,
                    style: { fontSize: 10 }
                  }}
                />
                <YAxis
                  yAxisId='e'
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  stroke='#2563eb'
                  tickFormatter={(v: number) => v.toFixed(3)}
                  width={72}
                />
                <YAxis
                  yAxisId='f'
                  orientation='right'
                  scale='log'
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  stroke='#dc2626'
                  tickFormatter={(v: number) => v.toExponential(0)}
                  width={56}
                />
                <Tooltip content={<ConvTooltip />} />
                {isRelaxConv ? (
                  <ReferenceLine
                    yAxisId='f'
                    y={forcThr}
                    stroke='#dc2626'
                    strokeDasharray='4 4'
                    strokeOpacity={0.7}
                    label={{
                      value: `forc_conv_thr ${forcThr.toExponential(1)}`,
                      position: 'insideBottomRight',
                      fontSize: 9,
                      fill: '#dc2626'
                    }}
                  />
                ) : null}
                {isRelaxConv ? (
                  <ReferenceLine
                    yAxisId='f'
                    y={etotThr}
                    stroke='#16a34a'
                    strokeDasharray='4 4'
                    strokeOpacity={0.7}
                    label={{
                      value: `etot_conv_thr ${etotThr.toExponential(0)}`,
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: '#16a34a'
                    }}
                  />
                ) : null}
                <Line
                  yAxisId='e'
                  dataKey='energy'
                  name={t('energyRy')}
                  type='monotone'
                  stroke='#2563eb'
                  strokeWidth={1.2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId='f'
                  dataKey='force'
                  name={t('forceRyBohr')}
                  type='monotone'
                  stroke='#dc2626'
                  strokeWidth={1.2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId='f'
                  dataKey='dE'
                  name={t('deltaERy')}
                  type='monotone'
                  stroke='#16a34a'
                  strokeWidth={1}
                  strokeDasharray='2 2'
                  dot={{ r: 1.5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className='mt-1 flex flex-wrap gap-3 text-[10px]'>
            <span className='flex items-center gap-1'>
              <span className='inline-block size-2 rounded-[1px] bg-[#2563eb]' />
              {t('energyRy')}
            </span>
            <span className='flex items-center gap-1'>
              <span className='inline-block size-2 rounded-[1px] bg-[#dc2626]' />
              {t('forceRyBohr')}
            </span>
            <span className='flex items-center gap-1'>
              <span className='inline-block size-2 rounded-[1px] bg-[#16a34a]' />
              {t('deltaERy')}
            </span>
          </div>
          <p className='text-muted-foreground mt-1 text-[10px]'>{t('convThrNote')}</p>
        </div>
      ) : null}
    </div>
  );
}
