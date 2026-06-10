/**
 * Custom React Flow node for a DFT calc unit — Mat3ra-style inline editing.
 *
 * Node shell (handles + header + expand toggle); the editable params render
 * inline via PwFields / PostprocFields and persist into node.data.params
 * through updateNodeData.
 *
 * @phase R244-dag-editor-b3b
 */
'use client';

import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { PostprocFields, PwFields } from '@/features/computation/components/dft-node-fields';

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

export function DftUnitNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const [open, setOpen] = useState(false);

  const label = String(data.id ?? id);
  const calcType = String(data.calcType ?? '');
  const params = (data.params ?? {}) as Record<string, unknown>;
  const setParam = (key: string, value: unknown) =>
    updateNodeData(id, { params: { ...params, [key]: value } });

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
            <PwFields params={params} setParam={setParam} />
          ) : (
            <PostprocFields params={params} setParam={setParam} />
          )}
        </div>
      ) : null}

      <Handle type='source' position={Position.Right} className='!bg-muted-foreground' />
    </div>
  );
}
