/**
 * Custom React Flow node for a DFT calc unit.
 *
 * Shows the unit id + a human calc-type label, with target (left) / source
 * (right) handles so units can be wired into a dependency chain.
 *
 * @phase R241-dag-editor
 */
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

const TYPE_LABEL: Record<string, string> = {
  'vc-relax': 'Relax (cell + ions)',
  scf: 'SCF',
  nscf: 'NSCF',
  bands: 'Band structure',
  dos: 'DOS',
  pdos: 'Projected DOS',
  ppbands: 'Band plot'
};

export function DftUnitNode({ data }: NodeProps) {
  const id = String(data.id ?? '');
  const calcType = String(data.calcType ?? '');
  return (
    <div className='bg-card min-w-32 rounded-md border px-3 py-2 shadow-sm'>
      <Handle type='target' position={Position.Left} className='!bg-muted-foreground' />
      <div className='text-sm font-medium'>{id}</div>
      <div className='text-muted-foreground text-xs'>{TYPE_LABEL[calcType] ?? calcType}</div>
      <Handle type='source' position={Position.Right} className='!bg-muted-foreground' />
    </div>
  );
}
