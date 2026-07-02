/**
 * DftAvgpotTab — planar / macroscopic-averaged electrostatic potential V(z)
 * from an `avgpot` unit (pp.x plot_num=11 → average.x). Two curves over z (Å),
 * with the vacuum plateau (max of the macroscopic curve) read out — the vacuum
 * reference for the two-step band-alignment lineup. CSV export included.
 *
 * @phase R357-avgpot-plot
 */
'use client';

import { IconDownload, IconLoader2 } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import type { DftWorkflow } from '@/types/dft';

interface AvgpotData {
  unitId: string;
  z: number[];
  planar: number[];
  macro: number[];
  vacuumEv: number;
  nPoints: number;
}

function downloadCsv(data: AvgpotData) {
  const lines = ['z_A,planar_eV,macro_eV'];
  for (let i = 0; i < data.z.length; i++) {
    lines.push(`${data.z[i]},${data.planar[i]},${data.macro[i]}`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `avgpot-${data.unitId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DftAvgpotTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const unit = (workflow.units ?? []).find((u) => (u.calcType ?? '') === 'avgpot');
  const [data, setData] = useState<AvgpotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/dft/avgpot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: workflow.id, unitId: unit?.id })
        });
        const body = (await res.json().catch(() => null)) as
          | (AvgpotData & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !body || !Array.isArray(body.z)) {
          setError(body?.error ?? t('avgpotError'));
          return;
        }
        setData(body);
      } catch {
        if (!cancelled) setError(t('avgpotError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id, unit?.id]);

  if (!unit) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('avgpotNoUnit')}</div>
    );
  }
  if (loading) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>
        <IconLoader2 className='mr-2 inline size-4 animate-spin' />
        {t('avgpotLoading')}
      </div>
    );
  }
  if (error || !data) {
    return <div className='text-destructive py-12 text-center text-sm'>{error}</div>;
  }

  const rows = data.z.map((z, i) => ({ z, planar: data.planar[i], macro: data.macro[i] }));

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-sm'>
          {t('avgpotVacuum')}:{' '}
          <span className='font-mono font-medium tabular-nums'>{data.vacuumEv.toFixed(3)} eV</span>
        </p>
        <Button variant='outline' size='sm' onClick={() => downloadCsv(data)}>
          <IconDownload className='mr-1 size-3.5' />
          CSV
        </Button>
      </div>
      <div className='h-[420px] w-full'>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray='3 3' className='opacity-40' />
            <XAxis
              dataKey='z'
              type='number'
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: 'z (Å)', position: 'insideBottom', offset: -4 }}
            />
            <YAxis
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: 'V (eV)', angle: -90, position: 'insideLeft' }}
              width={56}
            />
            <Tooltip
              formatter={(v: number | string) => (typeof v === 'number' ? `${v.toFixed(4)} eV` : v)}
              labelFormatter={(v) => `z = ${Number(v).toFixed(3)} Å`}
            />
            <ReferenceLine
              y={data.vacuumEv}
              stroke='#16a34a'
              strokeDasharray='4 4'
              label={{ value: 'vacuum', position: 'right', fontSize: 11 }}
            />
            <Line
              type='monotone'
              dataKey='planar'
              stroke='#94a3b8'
              dot={false}
              strokeWidth={1}
              name={t('avgpotPlanar')}
            />
            <Line
              type='monotone'
              dataKey='macro'
              stroke='#2563eb'
              dot={false}
              strokeWidth={2}
              name={t('avgpotMacro')}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className='text-muted-foreground text-xs'>{t('avgpotHint')}</p>
    </div>
  );
}
