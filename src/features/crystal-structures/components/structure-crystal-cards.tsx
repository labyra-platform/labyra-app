/**
 * StructureCrystalCards — Materials-Project-style crystallography panel: lattice
 * parameters, Wyckoff positions, symmetry, and a facts card (atoms / density /
 * dimensionality / oxidation states). Fed by /api/structures/[id]/analysis.
 * @phase R387
 */
'use client';

import { IconLoader2 } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { StructureAnalysis } from '@/types/crystal-structure';
import { formatSpaceGroup } from '@/features/spectra/utils/format-units';

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className='rounded-lg border p-4'>
      {title ? (
        <p className='text-muted-foreground mb-2 text-sm underline underline-offset-4'>{title}</p>
      ) : null}
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-4 border-b py-1.5 text-sm last:border-b-0'>
      <span className='font-medium'>{label}</span>
      <span className='text-right'>{value}</span>
    </div>
  );
}

export function StructureCrystalCards({ structureId }: { structureId: string }) {
  const t = useTranslations('structures');
  const [data, setData] = useState<StructureAnalysis | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void (async () => {
      try {
        const res = await fetch(`/api/structures/${structureId}/analysis`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as StructureAnalysis;
        if (alive) {
          setData(json);
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

  if (state === 'loading') {
    return (
      <div className='text-muted-foreground flex items-center gap-2 py-8 text-sm'>
        <IconLoader2 className='size-4 animate-spin' />
        {t('analysisLoading')}
      </div>
    );
  }
  if (state === 'error' || !data) {
    return <p className='text-muted-foreground py-6 text-sm'>{t('analysisError')}</p>;
  }

  const L = data.lattice;
  const S = data.symmetry;

  return (
    <div className='space-y-3'>
      <h2 className='text-lg font-semibold'>{t('crystalStructure')}</h2>
      <div className='grid gap-3 lg:grid-cols-2'>
        {L ? (
          <Card title={t('latticeConventional')}>
            <Row label='a' value={`${L.a.toFixed(2)} Å`} />
            <Row label='b' value={`${L.b.toFixed(2)} Å`} />
            <Row label='c' value={`${L.c.toFixed(2)} Å`} />
            <Row label='α' value={`${L.alpha.toFixed(2)} °`} />
            <Row label='β' value={`${L.beta.toFixed(2)} °`} />
            <Row label='γ' value={`${L.gamma.toFixed(2)} °`} />
            <Row label={t('volume')} value={`${L.volume.toFixed(2)} Å³`} />
          </Card>
        ) : null}

        <Card title={t('wyckoffPositions')}>
          {data.wyckoff.length > 0 ? (
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-muted-foreground border-b text-left'>
                  <th className='py-1 font-medium'>{t('wyckoffLabel')}</th>
                  <th className='py-1 font-medium'>{t('wyckoffElement')}</th>
                  <th className='py-1 font-medium'>a</th>
                  <th className='py-1 font-medium'>b</th>
                  <th className='py-1 font-medium'>c</th>
                </tr>
              </thead>
              <tbody>
                {data.wyckoff.map((w, i) => (
                  <tr key={i} className='border-b last:border-b-0'>
                    <td className='py-1 font-mono'>{w.label}</td>
                    <td className='py-1'>{w.element}</td>
                    <td className='py-1 font-mono'>{w.x}</td>
                    <td className='py-1 font-mono'>{w.y}</td>
                    <td className='py-1 font-mono'>{w.z}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-muted-foreground text-sm'>—</p>
          )}
        </Card>

        {S ? (
          <Card title={t('symmetry')}>
            <Row
              label={t('propCrystalSystem')}
              value={<span className='capitalize'>{S.crystalSystem}</span>}
            />
            <Row
              label={t('latticeSystem')}
              value={<span className='capitalize'>{S.latticeSystem}</span>}
            />
            <Row label={t('hallNumber')} value={S.hallSymbol ?? S.hallNumber ?? '—'} />
            <Row label={t('internationalNumber')} value={S.internationalNumber ?? '—'} />
            <Row
              label={t('symbol')}
              value={
                <span className='font-mono'>
                  {S.internationalSymbol ? formatSpaceGroup(S.internationalSymbol) : '—'}
                </span>
              }
            />
            <Row
              label={t('pointGroup')}
              value={<span className='font-mono'>{S.pointGroup ?? '—'}</span>}
            />
          </Card>
        ) : null}

        <Card>
          <Row label={t('numberOfAtoms')} value={data.nsites} />
          <Row
            label={t('density')}
            value={data.density != null ? `${data.density.toFixed(2)} g·cm⁻³` : '—'}
          />
          <Row label={t('dimensionality')} value={data.dimensionality ?? '—'} />
          <Row
            label={t('oxidationStates')}
            value={
              data.oxidationStates.length > 0 ? (
                <span className='font-mono'>{data.oxidationStates.join(', ')}</span>
              ) : (
                '—'
              )
            }
          />
        </Card>
      </div>
    </div>
  );
}
