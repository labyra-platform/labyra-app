/**
 * Custom React Flow node for a DFT calc unit — Mat3ra-style INLINE editing.
 *
 * The node expands to edit its own params right on the canvas (no side panel).
 * Edits persist into node.data.params via React Flow's updateNodeData, ready
 * for serialization at submit time.
 *
 *  - pw calc types (vc-relax/scf/nscf/bands): k-grid + conv_thr
 *  - postproc (dos/pdos/ppbands): Emin / Emax
 *
 * Interactive elements carry `nodrag` so editing doesn't drag the node.
 *
 * @phase R243-dag-editor-b3-inline
 */
'use client';

import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';

const TYPE_LABEL: Record<string, string> = {
  'vc-relax': 'Relax (cell + ions)',
  scf: 'SCF',
  nscf: 'NSCF',
  bands: 'Band structure',
  dos: 'DOS',
  pdos: 'Projected DOS',
  ppbands: 'Band plot'
};

const PW_TYPES = new Set(['vc-relax', 'scf', 'nscf', 'bands']);
const INPUT_CLS = 'bg-background nodrag rounded border px-1 py-0.5 text-xs tabular-nums';

export function DftUnitNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [open, setOpen] = useState(false);

  const label = String(data.id ?? id);
  const calcType = String(data.calcType ?? '');
  const params = (data.params ?? {}) as Record<string, unknown>;
  const setParam = (key: string, value: unknown) =>
    updateNodeData(id, { params: { ...params, [key]: value } });

  const kgrid = (params.kgrid as number[] | undefined) ?? [6, 6, 6];

  return (
    <div className='bg-card min-w-44 rounded-md border shadow-sm'>
      <Handle type='target' position={Position.Left} className='!bg-muted-foreground' />

      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='nodrag flex w-full items-center gap-1 px-3 pt-2 text-left'
      >
        {open ? (
          <IconChevronDown className='size-3' aria-hidden />
        ) : (
          <IconChevronRight className='size-3' aria-hidden />
        )}
        <span className='text-sm font-medium'>{label}</span>
      </button>
      <div className='text-muted-foreground px-3 pb-2 pl-7 text-xs'>
        {TYPE_LABEL[calcType] ?? calcType}
      </div>

      {open ? (
        <div className='space-y-2 border-t px-3 py-2'>
          {PW_TYPES.has(calcType) ? (
            <>
              <div className='space-y-0.5'>
                <span className='text-muted-foreground text-[10px] uppercase'>k-grid</span>
                <div className='flex gap-1'>
                  {[0, 1, 2].map((i) => (
                    <input
                      key={i}
                      type='number'
                      min={1}
                      value={kgrid[i] ?? 1}
                      onChange={(e) => {
                        const next = [...kgrid];
                        next[i] = Number(e.target.value);
                        setParam('kgrid', next);
                      }}
                      className={`${INPUT_CLS} w-12`}
                    />
                  ))}
                </div>
              </div>
              <div className='space-y-0.5'>
                <span className='text-muted-foreground text-[10px] uppercase'>conv_thr</span>
                <input
                  type='text'
                  value={String(params.convThr ?? '1e-8')}
                  onChange={(e) => setParam('convThr', e.target.value)}
                  className={`${INPUT_CLS} w-full`}
                />
              </div>
            </>
          ) : (
            <div className='space-y-0.5'>
              <span className='text-muted-foreground text-[10px] uppercase'>Emin / Emax (eV)</span>
              <div className='flex gap-1'>
                <input
                  type='number'
                  value={Number(params.emin ?? 0)}
                  onChange={(e) => setParam('emin', Number(e.target.value))}
                  className={`${INPUT_CLS} w-16`}
                />
                <input
                  type='number'
                  value={Number(params.emax ?? 20)}
                  onChange={(e) => setParam('emax', Number(e.target.value))}
                  className={`${INPUT_CLS} w-16`}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}

      <Handle type='source' position={Position.Right} className='!bg-muted-foreground' />
    </div>
  );
}
