/**
 * DftResultsTab — consolidated scientific summary table for a DFT workflow:
 * band gap, orbital character (PDOS) at VBM/CBM, DOS at Fermi, spin/magnetism,
 * total energy + SCF convergence. Fetches /api/dft/results. @phase R297
 */
'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DftWorkflow } from '@/types/dft';

interface OrbChar {
  label: string;
  pct: number;
}
interface BandGap {
  vbm_ev: number;
  cbm_ev: number;
  band_gap_ev: number;
  vbm_k: number[];
  cbm_k: number[];
  direct: boolean;
}
interface ResultsData {
  totalEnergyRy?: number | null;
  fermiEv?: number | null;
  nElectrons?: number | null;
  scfIterations?: number | null;
  spin?: { spinPolarized: boolean; totalMag: number | null; absMag: number | null };
  scfGap?: { homoEv: number; lumoEv: number; gapEv: number } | null;
  bandGap?: BandGap | null;
  dos?: { fermiEv: number | null; dosAtFermi: number | null; nPoints: number } | null;
  pdosCharacter?: { vbm: OrbChar[]; cbm: OrbChar[] } | null;
}

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

function kLabel(k: number[]): string {
  if (k.every((x) => Math.abs(x) < 1e-4)) return 'Γ';
  return `(${k.map((x) => x.toFixed(3)).join(', ')})`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex items-baseline justify-between gap-4 py-1'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='text-sm tabular-nums'>{children}</dd>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='rounded-lg border p-3'>
      <p className='text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase'>
        {title}
      </p>
      <dl>{children}</dl>
    </div>
  );
}
function OrbChips({ items }: { items: OrbChar[] }) {
  return (
    <span className='flex flex-wrap justify-end gap-1'>
      {items
        .filter((o) => o.pct >= 1)
        .map((o, i) => (
          <span
            key={o.label}
            className='inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium'
            style={{
              backgroundColor: `${PALETTE[i % PALETTE.length]}1f`,
              color: PALETTE[i % PALETTE.length]
            }}
          >
            {o.label} {o.pct.toFixed(0)}%
          </span>
        ))}
    </span>
  );
}

export function DftResultsTab({ workflow }: { workflow: DftWorkflow }) {
  const t = useTranslations('computation');
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dft/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: workflow.id })
      });
      const body = (await res.json().catch(() => ({}))) as ResultsData & { error?: string };
      if (!res.ok) {
        setError(body.error ?? t('resultsError'));
        return;
      }
      setData(body);
    } catch {
      setError(t('resultsError'));
    } finally {
      setLoading(false);
    }
  }, [workflow.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('resultsLoading')}</div>
    );
  }
  if (error) {
    return <div className='text-destructive py-12 text-center text-sm'>{error}</div>;
  }
  if (!data) return null;

  const bg = data.bandGap;
  const fermi = data.dos?.fermiEv ?? data.fermiEv ?? null;
  const empty =
    !bg && !data.dos && !data.pdosCharacter && data.totalEnergyRy == null && !data.scfGap;
  if (empty) {
    return (
      <div className='text-muted-foreground py-12 text-center text-sm'>{t('resultsEmpty')}</div>
    );
  }

  return (
    <div className='mx-auto max-w-3xl space-y-3'>
      {bg ? (
        <div className='rounded-lg border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-2xl font-semibold tabular-nums'>
              {bg.band_gap_ev.toFixed(2)} eV
            </span>
            <span className='bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-medium'>
              {bg.direct ? t('directGap') : t('indirectGap')}
            </span>
            <span className='text-muted-foreground text-xs'>{t('bandGapLabel')}</span>
          </div>
          <dl className='mt-2'>
            <Row label='VBM'>
              {bg.vbm_ev.toFixed(4)} eV · {kLabel(bg.vbm_k)}
            </Row>
            <Row label='CBM'>
              {bg.cbm_ev.toFixed(4)} eV · {kLabel(bg.cbm_k)}
            </Row>
          </dl>
        </div>
      ) : null}

      <div className='grid gap-3 sm:grid-cols-2'>
        {data.pdosCharacter ? (
          <Section title={t('orbitalCharacter')}>
            <Row label='VBM'>
              <OrbChips items={data.pdosCharacter.vbm} />
            </Row>
            <Row label='CBM'>
              <OrbChips items={data.pdosCharacter.cbm} />
            </Row>
          </Section>
        ) : null}

        {data.dos ? (
          <Section title={t('densityOfStates')}>
            {fermi != null ? <Row label={t('fermiLevel')}>{fermi.toFixed(3)} eV</Row> : null}
            {data.dos.dosAtFermi != null ? (
              <Row label={t('dosAtFermi')}>{data.dos.dosAtFermi.toFixed(3)}</Row>
            ) : null}
            <Row label={t('gridPoints')}>{data.dos.nPoints}</Row>
          </Section>
        ) : null}

        <Section title={t('spin')}>
          <Row label={t('spinPolarized')}>{data.spin?.spinPolarized ? t('yes') : t('no')}</Row>
          {data.spin?.totalMag != null ? (
            <Row label={t('totalMag')}>{data.spin.totalMag.toFixed(2)} μB</Row>
          ) : null}
          {data.spin?.absMag != null ? (
            <Row label={t('absMag')}>{data.spin.absMag.toFixed(2)} μB</Row>
          ) : null}
        </Section>

        <Section title={t('energyConvergence')}>
          {data.totalEnergyRy != null ? (
            <Row label={t('totalEnergy')}>{data.totalEnergyRy.toFixed(4)} Ry</Row>
          ) : null}
          {data.nElectrons != null ? <Row label={t('electrons')}>{data.nElectrons}</Row> : null}
          {data.scfGap ? <Row label={t('scfGapHl')}>{data.scfGap.gapEv.toFixed(2)} eV</Row> : null}
          {data.scfIterations != null ? (
            <Row label={t('scfIterations')}>{data.scfIterations}</Row>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
