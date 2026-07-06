/**
 * StructureViewer — client wrapper around the lazy Three.js Viewer3D. Fetches the
 * render scene from /api/structures/[id]/scene, exposes show/hide toggles
 * (instant, no rebuild), CIF/POSCAR export, and an element legend.
 *
 * @phase R327-structure-viewer
 */
'use client';

import {
  IconCamera,
  IconFileExport,
  IconLoader2,
  IconMaximize,
  IconRotate,
  IconSettings
} from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [oxidation, setOxidation] = useState<string[]>([]);

  // Oxidation states for the pills come from the cached crystallographic analysis.
  useEffect(() => {
    let alive = true;
    setOxidation([]);
    void (async () => {
      try {
        const res = await fetch(`/api/structures/${structureId}/analysis`);
        if (!res.ok) return;
        const data = (await res.json()) as { oxidationStates?: string[] };
        if (alive) setOxidation(data.oxidationStates ?? []);
      } catch {
        /* pills fall back to element symbols */
      }
    })();
    return () => {
      alive = false;
    };
  }, [structureId]);

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
  // element → oxidation label (e.g. W → "W4+"), from the cached analysis.
  const oxByEl = new Map<string, string>();
  for (const ox of oxidation) {
    const m = /^([A-Za-z]+)/.exec(ox);
    if (m) oxByEl.set(m[1], ox);
  }

  const viewerActions = useRef<{ reset: () => void; screenshot: () => void }>({
    reset: () => {},
    screenshot: () => {}
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const toolBtn =
    'bg-background/85 hover:bg-background flex size-8 items-center justify-center rounded-md border shadow-sm';

  return (
    <div className='space-y-3'>
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
        <div ref={frameRef} className={`${FRAME} bg-background relative overflow-hidden`}>
          <Viewer3D
            scene={scene}
            show={show}
            onReady={(a) => {
              viewerActions.current = a;
            }}
          />

          {/* MP-style vertical toolbar */}
          <div className='absolute right-2 top-2 flex flex-col gap-1'>
            <button
              type='button'
              className={toolBtn}
              title={t('viewerFullscreen')}
              aria-label={t('viewerFullscreen')}
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void frameRef.current?.requestFullscreen();
              }}
            >
              <IconMaximize className='size-4' />
            </button>

            <Popover>
              <PopoverTrigger asChild>
                <button type='button' className={toolBtn} title={t('viewerSettings')}>
                  <IconSettings className='size-4' />
                </button>
              </PopoverTrigger>
              <PopoverContent align='end' side='left' className='w-44 space-y-2'>
                {TOGGLES.map((k) => (
                  <label key={k} className='flex cursor-pointer items-center gap-2 text-sm'>
                    <Checkbox checked={show[k]} onCheckedChange={() => toggle(k)} />
                    {t(`viewerShow_${k}`)}
                  </label>
                ))}
              </PopoverContent>
            </Popover>

            <button
              type='button'
              className={toolBtn}
              title={t('viewerReset')}
              aria-label={t('viewerReset')}
              onClick={() => viewerActions.current.reset()}
            >
              <IconRotate className='size-4' />
            </button>

            <button
              type='button'
              className={toolBtn}
              title={t('viewerScreenshot')}
              aria-label={t('viewerScreenshot')}
              onClick={() => viewerActions.current.screenshot()}
            >
              <IconCamera className='size-4' />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type='button' className={toolBtn} title={t('viewerExport')}>
                  <IconFileExport className='size-4' />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' side='left'>
                <DropdownMenuItem asChild>
                  <a href={`/api/structures/${structureId}/export?fmt=cif`}>CIF</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/structures/${structureId}/export?fmt=poscar`}>POSCAR</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Oxidation-state pills (bottom-right), colored by element */}
          {legend.length > 0 ? (
            <div className='absolute bottom-2 right-2 flex flex-wrap justify-end gap-1'>
              {legend.map(([el, color]) => (
                <span
                  key={el}
                  className='rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm'
                  style={{ backgroundColor: color }}
                >
                  {oxByEl.get(el) ?? el}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
