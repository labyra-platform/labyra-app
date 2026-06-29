/**
 * DftBandsTab — band structure (+ DOS/PDOS beside it) for a workflow's bands
 * unit. Fetches /api/dft/bands and (best-effort) /api/dft/dos; the two panels
 * share an energy axis via a zero reference + window computed from the bands.
 *
 * @phase R290-dft-dos-ui
 */
'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { BandStructurePlot, type BandsData } from './band-structure-plot';
import { DosPdosPanel, type DosData } from './dos-pdos-panel';
import type { DftWorkflow } from '@/types/dft';

export function DftBandsTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const bandsUnits = (workflow.units ?? []).filter(
    (u) => (u.calcType ?? '').toLowerCase() === 'bands'
  );
  const [unitId, setUnitId] = useState<string | null>(bandsUnits[0]?.id ?? null);
  const [data, setData] = useState<BandsData | null>(null);
  const [dos, setDos] = useState<DosData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      setError(null);
      setData(null);
      setDos(null);
      try {
        const res = await fetch('/api/dft/bands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: workflow.id, unitId: uid })
        });
        const body = (await res.json().catch(() => ({}))) as Partial<BandsData> & {
          error?: string;
        };
        if (!res.ok) {
          setError(body.error ?? t('bandsError'));
          return;
        }
        setData(body as BandsData);
      } catch {
        setError(t('bandsError'));
      } finally {
        setLoading(false);
      }
      // DOS is optional enrichment — never blocks the band plot.
      try {
        const dres = await fetch('/api/dft/dos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId: workflow.id })
        });
        if (dres.ok) {
          const dbody = (await dres.json().catch(() => null)) as DosData | null;
          if (dbody && (dbody.total || (dbody.pdos && dbody.pdos.length > 0))) setDos(dbody);
        }
      } catch {
        /* DOS absent — show band alone */
      }
    },
    [workflow.id, t]
  );

  useEffect(() => {
    if (unitId) void load(unitId);
  }, [unitId, load]);

  if (bandsUnits.length === 0) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('bandsNoUnit')}</div>
    );
  }

  // Shared energy reference + window (same formula the band plot uses internally).
  const zero = data ? (data.fermiEv ?? data.gap?.vbm_ev ?? 0) : 0;
  const windowEv = data ? Math.max(5, (data.gap?.band_gap_ev ?? 0) + 2) : 5;

  return (
    <div className='flex h-full flex-col gap-3'>
      {bandsUnits.length > 1 ? (
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-xs'>{t('bandsUnit')}</span>
          <select
            className='h-8 rounded-md border bg-transparent px-2 text-sm'
            value={unitId ?? ''}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {bandsUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className='min-h-0 flex-1'>
        {loading ? (
          <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
            {t('bandsLoading')}
          </div>
        ) : error ? (
          <div className='text-destructive flex h-full items-center justify-center text-sm'>
            {error}
          </div>
        ) : data ? (
          <div className='flex h-full gap-3'>
            <div className='min-w-0 flex-[3]'>
              <BandStructurePlot data={data} />
            </div>
            {dos ? (
              <div className='min-w-0 flex-[1] border-l pl-3'>
                <DosPdosPanel data={dos} zero={zero} windowEv={windowEv} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
