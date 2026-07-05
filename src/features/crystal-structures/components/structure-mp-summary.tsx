/**
 * StructureMpSummary — Materials-Project property card (Image-4 style): band gap,
 * energy above hull, formation energy, magnetic ordering, total magnetization,
 * experimentally observed. Fetched from /api/structures/[id]/mp-summary (cached).
 * Renders nothing for non-MP structures. @phase R389
 */
'use client';

import { IconLoader2 } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { MpSummary } from '@/types/crystal-structure';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0'>
      <span className='font-medium'>{label}</span>
      <span className='text-primary text-right'>{value}</span>
    </div>
  );
}

/** Called with the fetched band gap so the parent can surface it in the table. */
export function StructureMpSummary({
  structureId,
  onLoaded
}: {
  structureId: string;
  onLoaded?: (mp: MpSummary) => void;
}) {
  const t = useTranslations('structures');
  const [data, setData] = useState<MpSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void (async () => {
      try {
        const res = await fetch(`/api/structures/${structureId}/mp-summary`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as MpSummary;
        if (alive) {
          setData(json);
          setState('ready');
          onLoaded?.(json);
        }
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureId]);

  if (state === 'loading') {
    return (
      <div className='text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm'>
        <IconLoader2 className='size-4 animate-spin' />
        {t('mpLoading')}
      </div>
    );
  }
  if (state === 'error' || !data) return null; // non-MP or unavailable → hide card

  const gap =
    data.bandGap == null
      ? '—'
      : data.bandGap < 1e-6
        ? t('metallic')
        : `${data.bandGap.toFixed(2)} eV${data.isGapDirect != null ? ` (${data.isGapDirect ? t('direct') : t('indirect')})` : ''}`;

  return (
    <div className='rounded-lg border p-4'>
      <p className='text-muted-foreground mb-2 text-sm underline underline-offset-4'>
        {t('mpProperties')}
      </p>
      <Row
        label={t('energyAboveHull')}
        value={data.energyAboveHull != null ? `${data.energyAboveHull.toFixed(3)} eV/atom` : '—'}
      />
      <Row label={t('bandGapLabel')} value={gap} />
      <Row
        label={t('formationEnergy')}
        value={
          data.formationEnergyPerAtom != null
            ? `${data.formationEnergyPerAtom.toFixed(3)} eV/atom`
            : '—'
        }
      />
      <Row label={t('magneticOrdering')} value={data.ordering ?? t('unknown')} />
      <Row
        label={t('totalMagnetization')}
        value={
          data.totalMagnetization != null ? `${data.totalMagnetization.toFixed(2)} µB/f.u.` : '—'
        }
      />
      <Row
        label={t('experimentallyObserved')}
        value={data.theoretical == null ? t('unknown') : data.theoretical ? t('no') : t('yes')}
      />
    </div>
  );
}
