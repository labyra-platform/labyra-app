/**
 * DftBandsTab — band structure + DOS/PDOS sharing one energy axis, with
 * interactive pan/zoom of the energy window: drag vertically to pan, wheel to
 * zoom, buttons for zoom in/out + reset. Both panels update together. Hover
 * tooltips still work — pointer capture only engages while dragging.
 *
 * @phase R291-dft-bands-zoom
 */
'use client';
import { IconZoomIn, IconZoomOut, IconRefresh } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BandStructurePlot, type BandsData } from './band-structure-plot';
import { DosPdosPanel, type DosData } from './dos-pdos-panel';
import { Button } from '@/components/ui/button';
import type { DftWorkflow } from '@/types/dft';

const E_SPAN_MIN = 0.5;
const E_SPAN_MAX = 40;

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
  const [eRange, setERange] = useState<[number, number]>([-5, 5]);
  const plotRef = useRef<HTMLDivElement>(null);

  const defaultWindow = useCallback(
    (d: BandsData) => Math.max(5, (d.gap?.band_gap_ev ?? 0) + 2),
    []
  );

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
        const bd = body as BandsData;
        setData(bd);
        const w = defaultWindow(bd);
        setERange([-w, w]);
      } catch {
        setError(t('bandsError'));
      } finally {
        setLoading(false);
      }
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
    [workflow.id, t, defaultWindow]
  );

  useEffect(() => {
    if (unitId) void load(unitId);
  }, [unitId, load]);

  // ── pan (drag) ──────────────────────────────────────────────────────────
  const dragRef = useRef<{ y: number; range: [number, number]; h: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { y: e.clientY, range: eRange, h: el.clientHeight || 1 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    const span = d.range[1] - d.range[0];
    const deltaE = (dy / d.h) * span; // drag down → reveal higher energies
    setERange([d.range[0] + deltaE, d.range[1] + deltaE]);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // ── zoom (wheel + buttons) ──────────────────────────────────────────────
  const zoomBy = useCallback((factor: number) => {
    setERange(([a, b]) => {
      const center = (a + b) / 2;
      const span = Math.min(E_SPAN_MAX, Math.max(E_SPAN_MIN, (b - a) * factor));
      return [center - span / 2, center + span / 2];
    });
  }, []);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const handler = (ev: WheelEvent) => {
      ev.preventDefault();
      zoomBy(ev.deltaY > 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoomBy, data]);
  const reset = () => {
    if (data) {
      const w = defaultWindow(data);
      setERange([-w, w]);
    }
  };

  if (bandsUnits.length === 0) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('bandsNoUnit')}</div>
    );
  }

  const zero = data ? (data.fermiEv ?? data.gap?.vbm_ev ?? 0) : 0;

  return (
    <div className='flex h-full flex-col gap-3'>
      <div className='flex items-center gap-2'>
        {bandsUnits.length > 1 ? (
          <>
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
          </>
        ) : null}
        {data ? (
          <div className='ml-auto flex items-center gap-1'>
            <span className='text-muted-foreground mr-1 hidden text-xs sm:inline'>
              {t('bandsZoomHint')}
            </span>
            <Button
              variant='outline'
              size='icon'
              className='size-7'
              onClick={() => zoomBy(1 / 1.4)}
              aria-label={t('bandsZoomIn')}
            >
              <IconZoomIn className='size-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='size-7'
              onClick={() => zoomBy(1.4)}
              aria-label={t('bandsZoomOut')}
            >
              <IconZoomOut className='size-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='size-7'
              onClick={reset}
              aria-label={t('bandsReset')}
            >
              <IconRefresh className='size-4' />
            </Button>
          </div>
        ) : null}
      </div>
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
          <div
            ref={plotRef}
            className='flex h-full cursor-ns-resize touch-none gap-3'
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className='min-w-0 flex-[3]'>
              <BandStructurePlot data={data} eMin={eRange[0]} eMax={eRange[1]} />
            </div>
            {dos ? (
              <div className='min-w-0 flex-[1] border-l pl-3'>
                <DosPdosPanel data={dos} zero={zero} eMin={eRange[0]} eMax={eRange[1]} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
