/**
 * Inline param fields for a DFT calc node (edited on the canvas, Mat3ra-style).
 *
 * Split out of dft-unit-node so each stays focused. All inputs carry `nodrag`.
 * Global settings (ecutwfc/ecutrho/functional/Hubbard/structure) live in the
 * workflow-level config (B4), not per node.
 *
 * @phase R244-dag-editor-b3b
 */
'use client';

import type { ReactNode } from 'react';

type Params = Record<string, unknown>;
type SetParam = (key: string, value: unknown) => void;

const INPUT = 'bg-background nodrag rounded border px-1 py-0.5 text-xs tabular-nums';
const OCCS = ['fixed', 'smearing'] as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <span className='text-muted-foreground text-[10px] uppercase'>{label}</span>
      {children}
    </div>
  );
}

export function PwFields({ params, setParam }: { params: Params; setParam: SetParam }) {
  const kgrid = (params.kgrid as number[] | undefined) ?? [6, 6, 6];
  const occupations = String(params.occupations ?? 'fixed');
  const vdw = params.vdwCorr === 'grimme-d3';

  return (
    <>
      <Field label='k-grid'>
        <div className='flex gap-1'>
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              type='number'
              min={1}
              aria-label={`k-grid ${['a', 'b', 'c'][i]}`}
              value={kgrid[i] ?? 1}
              onChange={(e) => {
                const next = [...kgrid];
                next[i] = Number(e.target.value);
                setParam('kgrid', next);
              }}
              className={`${INPUT} w-12`}
            />
          ))}
        </div>
      </Field>

      <Field label='occupations'>
        <div className='flex gap-1'>
          {OCCS.map((o) => (
            <button
              key={o}
              type='button'
              onClick={() => setParam('occupations', o)}
              className={`nodrag rounded border px-1.5 py-0.5 text-[10px] ${
                occupations === o ? 'bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </Field>

      {occupations === 'smearing' ? (
        <Field label='degauss'>
          <input
            type='text'
            aria-label='degauss'
            value={String(params.degauss ?? '0.007')}
            onChange={(e) => setParam('degauss', e.target.value)}
            className={`${INPUT} w-full`}
          />
        </Field>
      ) : null}

      <div className='flex gap-2'>
        <Field label='nbnd'>
          <input
            type='number'
            min={1}
            aria-label='nbnd'
            value={Number(params.nbnd ?? 0) || ''}
            placeholder='auto'
            onChange={(e) => setParam('nbnd', e.target.value ? Number(e.target.value) : null)}
            className={`${INPUT} w-16`}
          />
        </Field>
        <Field label='david_ndim'>
          <input
            type='number'
            min={2}
            aria-label='diago_david_ndim'
            value={Number(params.diagoDavidNdim ?? 8)}
            onChange={(e) => setParam('diagoDavidNdim', Number(e.target.value))}
            className={`${INPUT} w-14`}
          />
        </Field>
      </div>

      <Field label='conv_thr'>
        <input
          type='text'
          aria-label='conv_thr'
          value={String(params.convThr ?? '1e-8')}
          onChange={(e) => setParam('convThr', e.target.value)}
          className={`${INPUT} w-full`}
        />
      </Field>

      <label className='nodrag flex items-center gap-1.5 text-[10px]'>
        <input
          type='checkbox'
          aria-label='vdW D3 dispersion'
          checked={vdw}
          onChange={(e) => setParam('vdwCorr', e.target.checked ? 'grimme-d3' : null)}
          className='nodrag'
        />
        <span className='text-muted-foreground uppercase'>vdW D3</span>
      </label>
    </>
  );
}

export function PostprocFields({ params, setParam }: { params: Params; setParam: SetParam }) {
  return (
    <>
      <Field label='Emin / Emax (eV)'>
        <div className='flex gap-1'>
          <input
            type='number'
            aria-label='Emin (eV)'
            value={Number(params.emin ?? 0)}
            onChange={(e) => setParam('emin', Number(e.target.value))}
            className={`${INPUT} w-16`}
          />
          <input
            type='number'
            aria-label='Emax (eV)'
            value={Number(params.emax ?? 20)}
            onChange={(e) => setParam('emax', Number(e.target.value))}
            className={`${INPUT} w-16`}
          />
        </div>
      </Field>
      <Field label='DeltaE (eV)'>
        <input
          type='text'
          aria-label='DeltaE (eV)'
          value={String(params.deltaE ?? '0.01')}
          onChange={(e) => setParam('deltaE', e.target.value)}
          className={`${INPUT} w-20`}
        />
      </Field>
    </>
  );
}
