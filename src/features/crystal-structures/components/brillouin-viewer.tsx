/**
 * BrillouinViewer — client wrapper: fetches the Brillouin-zone geometry from
 * /api/structures/[id]/brillouin (cached) and renders the lazy Three.js viewer
 * with an element/path legend. @phase R398
 */
'use client';

import { IconChevronRight, IconLoader2 } from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { BrillouinZone } from '@/lib/dft/worker-client';

const FRAME = 'h-[300px] w-full rounded-lg border';

/** Tidy a seekpath label for display (GAMMA → Γ, K_1 → K₁). */
function prettyLabel(raw: string): string {
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  return raw
    .replace(/GAMMA/g, 'Γ')
    .replace(/_(\d)/g, (_m, d: string) => sub[Number(d)] ?? d)
    .replace(/DELTA/g, 'Δ')
    .replace(/SIGMA/g, 'Σ')
    .replace(/LAMBDA/g, 'Λ');
}

/** Segments → a readable path string, "|" marking discontinuities. */
function pathString(segments: [string, string][]): string {
  if (segments.length === 0) return '';
  const parts: string[] = [prettyLabel(segments[0][0])];
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    if (i > 0 && segments[i - 1][1] !== a) parts.push('|', prettyLabel(a));
    parts.push('→', prettyLabel(b));
  }
  return parts.join(' ');
}

/** Inverse of a 3×3 matrix (adjugate / det); null if singular. */
function inv3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    [(e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s],
    [(f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s],
    [(d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s]
  ];
}

/** Cartesian reciprocal point → fractional (crystal) coords, given b-matrix inverse. */
function toFrac(cart: number[], rInv: number[][]): number[] {
  return [0, 1, 2].map((k) => cart[0] * rInv[0][k] + cart[1] * rInv[1][k] + cart[2] * rInv[2][k]);
}

const fmt = (x: number) => {
  const r = Math.round(x * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};

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
          <KPathPanel bz={bz} pathLabel={t('brillouinPath')} coordsLabel={t('brillouinCoords')} />
        </>
      )}
    </div>
  );
}

/** Path string + the high-symmetry k-points with fractional (crystal) coords —
 *  these are exactly the K_POINTS {crystal_b} vertices used for a bands run. */
function KPathPanel({
  bz,
  pathLabel,
  coordsLabel
}: {
  bz: BrillouinZone;
  pathLabel: string;
  coordsLabel: string;
}) {
  const rInv = inv3(bz.reciprocal);
  const onPath = new Set<string>();
  for (const [a, b] of bz.segments) {
    onPath.add(a);
    onPath.add(b);
  }
  const rows = [...onPath]
    .map((label) => ({ label, cart: bz.points[label] }))
    .filter((r) => r.cart);

  return (
    <div className='space-y-2 rounded-lg border p-3 text-sm'>
      <div>
        <span className='text-muted-foreground text-xs'>{pathLabel}</span>
        <p className='mt-0.5 font-mono text-xs leading-relaxed break-words'>
          {pathString(bz.segments)}
        </p>
      </div>
      {rInv ? (
        <Collapsible>
          <CollapsibleTrigger className='text-primary flex items-center gap-1 text-xs font-medium'>
            <IconChevronRight className='size-3.5 transition-transform data-[state=open]:rotate-90' />
            {coordsLabel}
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-1.5'>
            <table className='w-full text-xs'>
              <tbody className='font-mono'>
                {rows.map((r) => {
                  const f = toFrac(r.cart, rInv);
                  return (
                    <tr key={r.label} className='border-b last:border-b-0'>
                      <td className='py-1 pr-2 font-semibold'>{prettyLabel(r.label)}</td>
                      <td className='text-muted-foreground py-1 text-right'>
                        {fmt(f[0])}, {fmt(f[1])}, {fmt(f[2])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
