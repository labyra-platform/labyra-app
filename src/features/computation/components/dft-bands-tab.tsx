/**
 * DftBandsTab — fetch /api/dft/bands for the workflow's bands unit and render
 * the band-structure plot. Lets the user pick which 'bands' unit if several.
 *
 * @phase R288-dft-bands-ui
 */
'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { BandStructurePlot, type BandsData } from './band-structure-plot';
import type { DftWorkflow } from '@/types/dft';

export function DftBandsTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const bandsUnits = (workflow.units ?? []).filter(
    (u) => (u.calcType ?? '').toLowerCase() === 'bands'
  );
  const [unitId, setUnitId] = useState<string | null>(bandsUnits[0]?.id ?? null);
  const [data, setData] = useState<BandsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (uid: string) => {
      setLoading(true);
      setError(null);
      setData(null);
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
          <BandStructurePlot data={data} />
        ) : null}
      </div>
    </div>
  );
}
