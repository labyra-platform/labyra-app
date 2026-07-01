/**
 * Band-overlay panel — fetches band-structure data for each selected run (that
 * has a bands unit) and hands them to the SVG overlay. Runs without a bands
 * calc, or whose fetch fails, are dropped.
 *
 * @phase R311-band-overlay
 */
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BandOverlay, type OverlayRun } from './band-overlay';
import type { BandsData } from './band-structure-plot';

const COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d'
];

export interface OverlayRunRef {
  id: string;
  name: string;
  bandsUnitId: string | null;
}

const CENTER = 'text-muted-foreground flex h-full items-center justify-center text-sm';

export function BandOverlayPanel({ runs }: { runs: OverlayRunRef[] }) {
  const t = useTranslations('computation');
  const withBands = runs.filter((r) => r.bandsUnitId);
  const key = withBands.map((r) => r.id).join(',');
  const [data, setData] = useState<OverlayRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refs = key ? key.split(',').map((id) => withBands.find((r) => r.id === id)!) : [];
    if (refs.length === 0) {
      setData([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      refs.map(async (r, i) => {
        try {
          const res = await fetch('/api/dft/bands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowId: r.id, unitId: r.bandsUnitId })
          });
          if (!res.ok) return null;
          const bands = (await res.json()) as BandsData;
          if (!bands?.kdist?.length) return null;
          return { id: r.id, name: r.name, color: COLORS[i % COLORS.length], bands };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      setData(results.filter((x): x is OverlayRun => x != null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of withBands
  }, [key]);

  if (withBands.length === 0) return <div className={CENTER}>{t('overlayNoBands')}</div>;
  if (loading) return <div className={CENTER}>{t('overlayLoading')}</div>;
  if (data.length === 0) return <div className={CENTER}>{t('overlayFailed')}</div>;
  return <BandOverlay runs={data} />;
}
