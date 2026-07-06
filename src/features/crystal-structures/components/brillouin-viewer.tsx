/**
 * BrillouinViewer — client wrapper: fetches the Brillouin-zone geometry from
 * /api/structures/[id]/brillouin (cached) and renders the lazy Three.js viewer
 * with an element/path legend. @phase R398
 */
'use client';

import { IconLoader2 } from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { BrillouinZone } from '@/lib/dft/worker-client';

const FRAME = 'h-[300px] w-full rounded-lg border';

const BrillouinViewer3D = dynamic(() => import('./brillouin-viewer-3d'), {
  ssr: false,
  loading: () => (
    <div className={`${FRAME} bg-muted/20 flex items-center justify-center`}>
      <IconLoader2 className='text-muted-foreground size-6 animate-spin' />
    </div>
  )
});

export function BrillouinViewer({ structureId }: { structureId: string }) {
  const t = useTranslations('structures');
  const [bz, setBz] = useState<BrillouinZone | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void (async () => {
      try {
        const res = await fetch(`/api/structures/${structureId}/brillouin`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as BrillouinZone;
        if (alive) {
          setBz(data);
          setState('ready');
        }
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [structureId]);

  return (
    <div className='space-y-2'>
      <h2 className='text-lg font-semibold'>{t('brillouinTitle')}</h2>
      {state === 'loading' ? (
        <div className={`${FRAME} bg-muted/20 flex items-center justify-center`}>
          <IconLoader2 className='text-muted-foreground size-6 animate-spin' />
        </div>
      ) : state === 'error' || !bz ? (
        <div
          className={`${FRAME} text-muted-foreground flex items-center justify-center px-6 text-center text-sm`}
        >
          {t('brillouinFailed')}
        </div>
      ) : (
        <>
          <div className={`${FRAME} bg-background overflow-hidden`}>
            <BrillouinViewer3D bz={bz} />
          </div>
          <p className='text-muted-foreground text-xs'>{t('brillouinHint')}</p>
        </>
      )}
    </div>
  );
}
