/**
 * StructureViewer — client wrapper around the lazy Three.js Viewer3D. Fetches the
 * render scene from /api/structures/[id]/scene, exposes show/hide toggles
 * (instant, no rebuild), CIF/POSCAR export, and an element legend.
 *
 * @phase R327-structure-viewer
 */
'use client';

import { IconDownload, IconLoader2 } from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { StructureScene } from '@/lib/dft/worker-client';
import type { ShowFlags } from './viewer-3d';

const FRAME = 'h-[440px] w-full rounded-lg border';

const Viewer3D = dynamic(() => import('./viewer-3d'), {
  ssr: false,
  loading: () => (
    <div className={`${FRAME} bg-muted/20 flex items-center justify-center`}>
      <IconLoader2 className='text-muted-foreground size-6 animate-spin' />
    </div>
  )
});

const TOGGLES: (keyof ShowFlags)[] = ['atoms', 'bonds', 'polyhedra', 'cell', 'axes'];

export function StructureViewer({ structureId }: { structureId: string }) {
  const t = useTranslations('structures');
  const [scene, setScene] = useState<StructureScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<ShowFlags>({
    atoms: true,
    bonds: true,
    polyhedra: true,
    cell: true,
    axes: true
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/structures/${structureId}/scene`);
        const data = (await res.json().catch(() => ({}))) as StructureScene & { error?: string };
        if (!alive) return;
        if (!res.ok) {
          setError(data.error ?? t('sceneFailed'));
          return;
        }
        setScene(data);
      } catch {
        if (alive) setError(t('sceneFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureId]);

  const toggle = (k: keyof ShowFlags) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const legend = scene ? [...new Map(scene.atoms.map((a) => [a.el, a.color])).entries()] : [];

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap gap-3 text-sm'>
          {TOGGLES.map((k) => (
            <label key={k} className='flex cursor-pointer items-center gap-1.5'>
              <Checkbox checked={show[k]} onCheckedChange={() => toggle(k)} />
              {t(`viewerShow_${k}`)}
            </label>
          ))}
        </div>
        <div className='flex gap-2'>
          <Button asChild variant='outline' size='sm'>
            <a href={`/api/structures/${structureId}/export?fmt=cif`}>
              <IconDownload className='mr-1 size-4' />
              CIF
            </a>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <a href={`/api/structures/${structureId}/export?fmt=poscar`}>
              <IconDownload className='mr-1 size-4' />
              POSCAR
            </a>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={`${FRAME} bg-muted/20 flex items-center justify-center`}>
          <IconLoader2 className='text-muted-foreground size-6 animate-spin' />
        </div>
      ) : error ? (
        <div
          className={`${FRAME} text-muted-foreground flex items-center justify-center px-6 text-center text-sm`}
        >
          {error}
        </div>
      ) : scene ? (
        <>
          <div className={FRAME}>
            <Viewer3D scene={scene} show={show} />
          </div>
          {legend.length > 0 ? (
            <div className='flex flex-wrap gap-3'>
              {legend.map(([el, color]) => (
                <span key={el} className='flex items-center gap-1.5 text-xs'>
                  <span className='size-3 rounded-full border' style={{ backgroundColor: color }} />
                  {el}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
