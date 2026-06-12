/**
 * DFT node panel — "Unit settings" (report DFT §10.4, Mat3ra-style).
 *
 * Read-only Details (engine/executable/cutoff/k-grid) + grouped params (§4.4:
 * Basic A+D with baseline ✓/⚠/⛔ | Advanced B | Locked C) + an INPUT section that
 * renders the exact QE .in via /api/dft/preview (catches a 1-char error before
 * launch). TEMPLATE (editable Jinja) + Next + Edit/Clone/Output come next.
 *
 * @phase R256-dft-param-baseline
 */
'use client';

import { IconFileText, IconLoader2, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DftParamList } from '@/features/computation/components/dft-param-list';
import type { DftUnit } from '@/types/dft';

const EXECUTABLE: Record<string, string> = {
  'vc-relax': 'pw.x',
  relax: 'pw.x',
  scf: 'pw.x',
  nscf: 'pw.x',
  bands: 'pw.x',
  ppbands: 'bands.x',
  dos: 'dos.x',
  pdos: 'projwfc.x',
  charge: 'pp.x'
};

function executableOf(u: DftUnit): string {
  return u.executable ?? EXECUTABLE[u.calcType] ?? 'pw.x';
}

interface DftNodePanelProps {
  unit: DftUnit;
  structure?: unknown;
  globalConfig?: unknown;
  ecutwfc?: number;
  status?: string;
  onClose: () => void;
}

export function DftNodePanel({
  unit,
  structure,
  globalConfig,
  ecutwfc,
  status,
  onClose
}: DftNodePanelProps) {
  const t = useTranslations('computation');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = unit.params ?? {};
  const grid = params.kPoints?.grid;
  const exe = executableOf(unit);

  async function runPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dft/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calcType: unit.calcType,
          structure,
          global: globalConfig,
          params
        })
      });
      const data: { input?: string; error?: string } = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('previewError'));
        return;
      }
      setPreview(data.input ?? '');
    } catch {
      setError(t('previewError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className='flex w-80 shrink-0 flex-col overflow-y-auto border-l'>
      <div className='flex items-center justify-between gap-2 border-b p-3'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{unit.name ?? unit.calcType}</p>
          <p className='text-muted-foreground truncate text-xs'>
            {unit.calcType} · <span className='font-mono'>{exe}</span>
          </p>
        </div>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0'
          onClick={onClose}
          aria-label={t('panelClose')}
        >
          <IconX className='size-4' aria-hidden />
        </Button>
      </div>

      <div className='space-y-4 p-3'>
        {status ? <Badge variant='secondary'>{status}</Badge> : null}

        <section>
          <p className='text-muted-foreground pb-1.5 text-xs font-medium uppercase'>
            {t('panelDetails')}
          </p>
          <dl className='space-y-1 text-sm'>
            <div className='flex justify-between gap-2'>
              <dt className='text-muted-foreground'>Engine</dt>
              <dd>QE 7.4.1</dd>
            </div>
            <div className='flex justify-between gap-2'>
              <dt className='text-muted-foreground'>Executable</dt>
              <dd className='font-mono'>{exe}</dd>
            </div>
            {ecutwfc == null ? null : (
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>ecutwfc</dt>
                <dd className='tabular-nums'>{ecutwfc} Ry</dd>
              </div>
            )}
            {grid ? (
              <div className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>k-grid</dt>
                <dd className='tabular-nums'>{`${grid[0]}×${grid[1]}×${grid[2]}`}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section>
          <p className='text-muted-foreground pb-1.5 text-xs font-medium uppercase'>
            {t('panelParams')}
          </p>
          <DftParamList params={params} />
        </section>

        <section>
          <div className='flex items-center justify-between gap-2 pb-1.5'>
            <p className='text-muted-foreground text-xs font-medium uppercase'>{t('panelInput')}</p>
            <Button
              size='sm'
              variant='outline'
              className='h-7'
              onClick={runPreview}
              disabled={loading}
            >
              {loading ? (
                <IconLoader2 className='size-3.5 animate-spin' aria-hidden />
              ) : (
                <IconFileText className='size-3.5' aria-hidden />
              )}
              {loading ? t('previewLoading') : t('previewButton')}
            </Button>
          </div>
          {error ? <p className='text-destructive text-xs'>{error}</p> : null}
          {preview != null ? (
            <pre className='bg-muted/40 max-h-72 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed'>
              {preview}
            </pre>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
